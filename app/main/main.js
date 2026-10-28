// Agent Buddy — desktop shell.
// - one overlay window per screen: transparent, always on top, clicks pass through except over a critter
// - settings window: dress-up, rooms, Claude connection
// - a local inbox on 127.0.0.1 that Claude Code hooks post to (nothing is sent to the internet)
const { app, BrowserWindow, screen, ipcMain, Tray, Menu, nativeImage, shell, nativeTheme } = require('electron')
const http = require('http')
const path = require('path')
const { mapHook } = require('./map')
const hooks = require('./claude-hooks')

const RENDERER = path.join(__dirname, '..', 'renderer', 'buddy.html')
const ICON = path.join(__dirname, '..', 'assets', process.platform === 'darwin' ? 'trayTemplate.png' : 'tray.png')

const overlays = new Map() // display id -> window
let overlaysShown = true
let settings = null
let tray = null
let serverError = null
let lastEventAt = 0

if (!app.requestSingleInstanceLock()) app.quit()
app.on('second-instance', () => openSettings())

const webPrefs = { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }

function createOverlays() {
  const displays = screen.getAllDisplays()
  const primary = String(screen.getPrimaryDisplay().id)
  const all = displays.map(d => String(d.id)).join(',')
  for (const d of displays) {
    const w = new BrowserWindow({
      ...d.workArea,
      transparent: true, frame: false, resizable: false, movable: false, hasShadow: false,
      alwaysOnTop: true, skipTaskbar: true, focusable: false, fullscreenable: false,
      // keep animating while other apps have focus
      backgroundColor: '#00000000', show: false, webPreferences: { ...webPrefs, backgroundThrottling: false },
    })
    w.setAlwaysOnTop(true, 'floating')
    w.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    w.setIgnoreMouseEvents(true, { forward: true })
    w.loadFile(RENDERER, { query: { mode: 'overlay', display: String(d.id), primary, all } })
    w.once('ready-to-show', () => { if (overlaysShown) w.showInactive() })
    overlays.set(String(d.id), w)
  }
}

function resetOverlays() {
  for (const w of overlays.values()) if (!w.isDestroyed()) w.destroy()
  overlays.clear()
  createOverlays()
}

function fitOverlays() {
  for (const d of screen.getAllDisplays()) overlays.get(String(d.id))?.setBounds(d.workArea)
}

function openSettings(agentId) {
  if (settings) {
    if (agentId) settings.webContents.send('buddy:select', agentId)
    settings.show(); settings.focus(); return
  }
  settings = new BrowserWindow({
    width: 1180, height: 760, minWidth: 820, minHeight: 600, title: 'Agent Buddy',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#12142A' : '#E9ECF6', show: false, webPreferences: webPrefs,
  })
  settings.loadFile(RENDERER, { query: { mode: 'settings', ...(agentId ? { select: agentId } : {}) } })
  settings.once('ready-to-show', () => settings.show())
  settings.on('closed', () => { settings = null; if (process.platform === 'darwin') app.dock?.hide() })
  if (process.platform === 'darwin') app.dock?.show()
}

function broadcast(channel, payload) {
  for (const w of [...overlays.values(), settings]) if (w && !w.isDestroyed()) w.webContents.send(channel, payload)
}

// ---- local inbox ----
function startInbox() {
  const server = http.createServer((req, res) => {
    // Browsers attach an Origin header; hooks (curl) don't. Refuse web pages poking at the inbox.
    if (req.headers.origin) { res.writeHead(403); return res.end() }
    if (req.method === 'GET' && req.url === '/ping') { res.writeHead(200); return res.end('agent-buddy') }
    if (req.method !== 'POST' || req.url !== '/event') { res.writeHead(404); return res.end() }
    let body = ''
    req.setEncoding('utf8')
    req.on('data', chunk => { body += chunk; if (body.length > 256 * 1024) req.destroy() })
    req.on('end', () => {
      res.writeHead(204); res.end() // empty reply: nothing is printed back into Claude
      try {
        const m = mapHook(JSON.parse(body))
        if (m) { lastEventAt = Date.now(); broadcast('buddy:event', m) }
      } catch { /* ignore malformed input */ }
    })
  })
  server.on('error', err => { serverError = err.code === 'EADDRINUSE' ? 'PORT_IN_USE' : String(err.code || err.message); refreshTray(); broadcast('buddy:status', statusPayload()) })
  server.listen(hooks.PORT, '127.0.0.1')
}

function statusPayload() {
  return { ...hooks.status(), serverError, lastEventAt, autostart: app.getLoginItemSettings().openAtLogin, overlayVisible: overlaysShown }
}

// ---- tray ----
function refreshTray() {
  if (!tray) return
  const st = hooks.status()
  tray.setToolTip(st.connected ? 'Agent Buddy · 已連接 Claude' : 'Agent Buddy · 尚未連接 Claude')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: overlaysShown ? '隱藏小夥伴' : '顯示小夥伴', click: toggleOverlay },
    { label: '打扮與設定…', click: () => openSettings() },
    { type: 'separator' },
    { label: st.connected ? '已連接 Claude Code' : '連接 Claude Code', type: 'checkbox', checked: st.connected, click: () => (st.connected ? doDisconnect() : doConnect()) },
    { label: '開機時自動開啟', type: 'checkbox', checked: app.getLoginItemSettings().openAtLogin, click: m => setAutostart(m.checked) },
    { type: 'separator' },
    { label: '結束 Agent Buddy', role: 'quit' },
  ]))
}

function toggleOverlay() {
  overlaysShown = !overlaysShown
  for (const w of overlays.values()) if (!w.isDestroyed()) (overlaysShown ? w.showInactive() : w.hide())
  refreshTray(); broadcast('buddy:status', statusPayload())
}

function setAutostart(on) {
  app.setLoginItemSettings({ openAtLogin: !!on, openAsHidden: true })
  refreshTray(); broadcast('buddy:status', statusPayload())
}

function doConnect() {
  try { const r = hooks.connect(); refreshTray(); broadcast('buddy:status', statusPayload()); return { ok: true, ...r } }
  catch (e) { return { ok: false, error: e.message === 'SETTINGS_UNREADABLE' ? 'SETTINGS_UNREADABLE' : 'WRITE_FAILED', file: hooks.settingsPath() } }
}
function doDisconnect() {
  try { const r = hooks.disconnect(); refreshTray(); broadcast('buddy:status', statusPayload()); return { ok: true, ...r } }
  catch (e) { return { ok: false, error: e.message === 'SETTINGS_UNREADABLE' ? 'SETTINGS_UNREADABLE' : 'WRITE_FAILED', file: hooks.settingsPath() } }
}

// ---- IPC from the pages ----
ipcMain.on('buddy:interactive', (e, on) => BrowserWindow.fromWebContents(e.sender)?.setIgnoreMouseEvents(!on, { forward: true }))
// A critter was dropped outside its screen: tell the page which screen it landed on and where.
ipcMain.handle('buddy:locate', (_e, x, y) => {
  const d = screen.getDisplayNearestPoint({ x: Math.round(x), y: Math.round(y) })
  const wa = d.workArea
  return { display: String(d.id), fx: (x - wa.x) / wa.width, fy: (y - wa.y) / wa.height }
})
ipcMain.on('buddy:open-settings', (_e, agentId) => openSettings(agentId))
ipcMain.handle('buddy:status', () => statusPayload())
ipcMain.handle('buddy:connect', () => doConnect())
ipcMain.handle('buddy:disconnect', () => doDisconnect())
ipcMain.handle('buddy:autostart', (_e, on) => { setAutostart(on); return statusPayload() })
ipcMain.handle('buddy:toggle-overlay', () => { toggleOverlay(); return statusPayload() })
ipcMain.handle('buddy:reveal-settings-file', () => shell.showItemInFolder(hooks.settingsPath()))
ipcMain.handle('buddy:test', async () => {
  const steps = [
    { state: 'thinking', text: '收到：測試一下' }, { state: 'searching', text: '讀 README.md' },
    { state: 'coding', text: '改 index.html' }, { state: 'tool', text: '跑測試' }, { state: 'done', text: '做完了，等你下一個指令' },
  ]
  for (const s of steps) { broadcast('buddy:event', { key: '__test__', label: '測試', ...s }); await new Promise(r => setTimeout(r, 1600)) }
  return true
})

app.whenReady().then(() => {
  if (process.platform === 'darwin') app.dock?.hide()
  startInbox()
  createOverlays()
  const img = nativeImage.createFromPath(ICON)
  if (process.platform === 'darwin') img.setTemplateImage(true)
  tray = new Tray(img)
  tray.on('click', () => (process.platform === 'win32' ? openSettings() : tray.popUpContextMenu()))
  refreshTray()
  screen.on('display-metrics-changed', fitOverlays)
  screen.on('display-added', resetOverlays)
  screen.on('display-removed', resetOverlays)
  // First launch, or not connected yet: open the setup screen.
  if (!hooks.status().connected) openSettings()
})

app.on('window-all-closed', () => { /* keep running in the tray */ })

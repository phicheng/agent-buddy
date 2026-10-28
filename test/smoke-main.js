// Smoke test: starts the real app, posts real Claude Code hook payloads, saves screenshots, quits.
// Run: xvfb-run -a npx electron --no-sandbox test/smoke-main.js <outdir>
const { app, BrowserWindow } = require('electron')
const http = require('http'), fs = require('fs'), path = require('path')
const out = process.argv.find(a => a.startsWith('--out='))?.slice(6) || '/tmp/buddy-smoke'
fs.mkdirSync(out, { recursive: true })
app.commandLine.appendSwitch('use-angle', 'swiftshader')
app.commandLine.appendSwitch('enable-unsafe-swiftshader')
const logs = []
app.on('web-contents-created', (_e, wc) => {
  wc.on('console-message', (e, level, message, line, source) => logs.push(`[${wc.getURL().includes('overlay') ? 'overlay' : 'settings'}] ${e?.message ?? message} @${e?.lineNumber ?? line}`))
  wc.on('preload-error', (_e, p, err) => logs.push('preload-error ' + err))
})
process.on('exit', () => fs.writeFileSync(path.join(out, 'console.txt'), logs.join('\n')))
require('../app/main/main.js')
const post = body => new Promise(r => { const req = http.request({ host: '127.0.0.1', port: 47321, path: '/event', method: 'POST', headers: { 'Content-Type': 'application/json' } }, res => { r(res.statusCode); res.resume() }); req.end(JSON.stringify(body)) })
const settings0 = () => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('settings'))
const wait = ms => new Promise(r => setTimeout(r, ms))
const shot = async (name) => { for (const w of BrowserWindow.getAllWindows()) { const url = w.webContents.getURL(); const tag = url.includes('overlay') ? 'overlay' : 'settings'; const img = await w.webContents.capturePage(); fs.writeFileSync(path.join(out, `${name}-${tag}.png`), img.toPNG()) } }
app.whenReady().then(async () => {
  await wait(4500)
  const codes = []
  codes.push(await post({ hook_event_name: 'UserPromptSubmit', cwd: '/Users/demo/mochi-app', prompt: '幫我把登入頁加上兩步驟驗證' }))
  await wait(900)
  codes.push(await post({ hook_event_name: 'PreToolUse', cwd: '/Users/demo/mochi-app', tool_name: 'Read', tool_input: { file_path: '/Users/demo/mochi-app/src/auth.ts' } }))
  codes.push(await post({ hook_event_name: 'PreToolUse', cwd: '/Users/demo/velaro-pricing', tool_name: 'WebSearch', tool_input: { query: 'PIX fees 2026' } }))
  await wait(4000)
  await shot('1-live')
  const errs = []
  for (const w of BrowserWindow.getAllWindows()) {
    const bounds = w.getBounds(); const r = await w.webContents.executeJavaScript(`(window.__buddy?{mode:__buddy.MODE,agents:__buddy.agents.map(a=>({name:a.c.name,key:a.c.key||null,state:a.state,text:a.text,visible:a.v.root.visible}))}:'no __buddy')`).catch(e => ({ error: String(e) })) //,agents:agents.map(a=>({name:a.c.name,key:a.c.key||null,state:a.state,text:a.text,visible:a.v.root.visible}))})`).catch(e => ({ error: String(e) }))
    errs.push({ ...r, bounds })
  }
  fs.writeFileSync(path.join(out, 'state.json'), JSON.stringify({ codes, windows: errs }, null, 2))
  // connect for real (temp HOME), then dark theme
  if (settings0()) { const r = await settings0().webContents.executeJavaScript(`window.buddy.connect()`); fs.writeFileSync(path.join(out, 'connect.json'), JSON.stringify(r, null, 2)) }
  require('electron').nativeTheme.themeSource = 'dark'
  await post({ hook_event_name: 'PreToolUse', cwd: '/Users/demo/mochi-app', tool_name: 'Edit', tool_input: { file_path: '/x/login.tsx' } })
  await wait(1500); await shot('3-dark')
  // room view in settings
  const settings = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('settings'))
  if (settings) { fs.writeFileSync(path.join(out,'room.txt'), String(await settings.webContents.executeJavaScript(`(async()=>{try{__buddy.setView('room');await new Promise(r=>setTimeout(r,800));return document.getElementById('stage').className+' | '+location.href.slice(-20)}catch(e){return e.stack}})()`).catch(e=>'ERR '+e))); await wait(1500); const img = await settings.webContents.capturePage(); fs.writeFileSync(path.join(out, '2-room-settings.png'), img.toPNG()) }
  app.exit(0)
})

// Adds or removes Agent Buddy's entries in Claude Code's user settings (~/.claude/settings.json).
// Nothing else in that file is touched; a backup is written before every change.
const fs = require('fs')
const path = require('path')
const os = require('os')

const PORT = 47321
const MARK = `127.0.0.1:${PORT}/event`
const EVENTS = [
  ['SessionStart', null],
  ['UserPromptSubmit', null],
  ['PreToolUse', '*'],
  ['PostToolUse', '*'],
  ['Notification', null],
  ['Stop', null],
  ['SessionEnd', null],
]

function settingsPath(home = os.homedir()) {
  return path.join(home, '.claude', 'settings.json')
}

// Sends the hook's JSON (stdin) to the app. Short timeout, and never fails the hook,
// so Claude keeps working normally when the app is closed.
function hookCommand(platform = process.platform) {
  const curl = `curl -s -m 1 -X POST -H "Content-Type: application/json" --data-binary @- http://${MARK}`
  return platform === 'win32' ? `${curl} || exit 0` : `${curl} >/dev/null 2>&1 || true`
}

function isOurs(h) {
  return h && typeof h.command === 'string' && h.command.includes(MARK)
}

function read(file) {
  if (!fs.existsSync(file)) return {}
  const raw = fs.readFileSync(file, 'utf8')
  if (!raw.trim()) return {}
  try {
    const data = JSON.parse(raw)
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('not an object')
    return data
  } catch {
    const err = new Error('SETTINGS_UNREADABLE')
    err.file = file
    throw err
  }
}

function backup(file) {
  if (!fs.existsSync(file)) return null
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const to = `${file}.agent-buddy-backup-${stamp}`
  fs.copyFileSync(file, to)
  return to
}

function write(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.agent-buddy-tmp`
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8')
  fs.renameSync(tmp, file)
}

function strip(data) {
  const hooks = data.hooks && typeof data.hooks === 'object' ? data.hooks : null
  if (!hooks) return data
  for (const ev of Object.keys(hooks)) {
    if (!Array.isArray(hooks[ev])) continue
    hooks[ev] = hooks[ev]
      .map(group => (group && Array.isArray(group.hooks) ? { ...group, hooks: group.hooks.filter(h => !isOurs(h)) } : group))
      .filter(group => !(group && Array.isArray(group.hooks) && group.hooks.length === 0))
    if (hooks[ev].length === 0) delete hooks[ev]
  }
  if (Object.keys(hooks).length === 0) delete data.hooks
  return data
}

function status(home) {
  const file = settingsPath(home)
  try {
    const data = read(file)
    const hooks = data.hooks || {}
    const connected = Object.values(hooks).some(list => Array.isArray(list) && list.some(g => g && Array.isArray(g.hooks) && g.hooks.some(isOurs)))
    return { connected, file, readable: true }
  } catch {
    return { connected: false, file, readable: false }
  }
}

function connect(home, platform) {
  const file = settingsPath(home)
  const data = strip(read(file))
  const backupFile = backup(file)
  data.hooks = data.hooks && typeof data.hooks === 'object' ? data.hooks : {}
  const command = hookCommand(platform)
  for (const [ev, matcher] of EVENTS) {
    const group = { hooks: [{ type: 'command', command, timeout: 3 }] }
    if (matcher) group.matcher = matcher
    data.hooks[ev] = Array.isArray(data.hooks[ev]) ? [...data.hooks[ev], group] : [group]
  }
  write(file, data)
  return { file, backupFile }
}

function disconnect(home) {
  const file = settingsPath(home)
  if (!fs.existsSync(file)) return { file, backupFile: null }
  const data = read(file)
  const backupFile = backup(file)
  write(file, strip(data))
  return { file, backupFile }
}

module.exports = { PORT, MARK, settingsPath, hookCommand, status, connect, disconnect }

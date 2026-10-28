// Plain node tests: node test/run.js
const assert = require('assert')
const fs = require('fs'), os = require('os'), path = require('path')
const { mapHook } = require('../app/main/map')
const hooks = require('../app/main/claude-hooks')
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok -', name) }

t('prompt → thinking, keyed by project folder', () => {
  const m = mapHook({ hook_event_name: 'UserPromptSubmit', cwd: '/Users/phi/projects/mochi', prompt: '幫我把登入頁加上兩步驟驗證謝謝' })
  assert.deepStrictEqual(m, { key: '/Users/phi/projects/mochi', label: 'mochi', state: 'thinking', text: '收到：幫我把登入頁加上兩步驟驗證謝謝'.slice(0, 3 + 16) })
})
t('tools map to the right action, only file names leave', () => {
  const base = { hook_event_name: 'PreToolUse', cwd: 'C:\\work\\velaro\\' }
  assert.strictEqual(mapHook({ ...base, tool_name: 'Read', tool_input: { file_path: 'C:\\work\\velaro\\secret\\a.ts' } }).text, '讀 a.ts')
  assert.strictEqual(mapHook({ ...base, tool_name: 'Edit', tool_input: { file_path: '/x/auth.ts' } }).state, 'coding')
  assert.strictEqual(mapHook({ ...base, tool_name: 'Bash', tool_input: { command: 'rm -rf x', description: 'Run tests' } }).text, 'Run tests')
  assert.strictEqual(mapHook({ ...base, tool_name: 'Bash', tool_input: { command: 'cat .env' } }).text, '執行指令')
  assert.strictEqual(mapHook({ ...base, tool_name: 'mcp__Google_Drive__search_files', tool_input: {} }).text, '查 Google Drive')
  assert.strictEqual(mapHook({ ...base, tool_name: 'Read' }).label, 'velaro')
})
t('stop, notification, failure, unknown', () => {
  assert.strictEqual(mapHook({ hook_event_name: 'Stop', cwd: '/a/b' }).state, 'done')
  assert.strictEqual(mapHook({ hook_event_name: 'Notification', cwd: '/a/b', message: 'Claude needs your permission to use Bash' }).text, '等你按同意')
  assert.strictEqual(mapHook({ hook_event_name: 'PostToolUse', cwd: '/a/b', tool_response: { is_error: true } }).state, 'error')
  assert.strictEqual(mapHook({ hook_event_name: 'PostToolUse', cwd: '/a/b', tool_response: { stdout: 'ok' } }), null)
  assert.strictEqual(mapHook({ hook_event_name: 'Whatever' }), null)
  assert.strictEqual(mapHook(null), null)
})

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'buddy-'))
const file = hooks.settingsPath(home)
t('connect on a fresh machine creates settings with our hooks only', () => {
  hooks.connect(home, 'darwin')
  const d = JSON.parse(fs.readFileSync(file, 'utf8'))
  assert.ok(d.hooks.PreToolUse[0].matcher === '*')
  assert.ok(d.hooks.Stop[0].hooks[0].command.includes(hooks.MARK))
  assert.ok(d.hooks.Stop[0].hooks[0].command.endsWith('|| true'))
  assert.strictEqual(hooks.status(home).connected, true)
})
t('existing settings and hooks are kept; connecting twice does not duplicate', () => {
  const mine = { model: 'opus', permissions: { allow: ['Bash(npm test)'] }, hooks: { Stop: [{ hooks: [{ type: 'command', command: 'say done' }] }] } }
  fs.writeFileSync(file, JSON.stringify(mine))
  hooks.connect(home, 'darwin'); hooks.connect(home, 'win32')
  const d = JSON.parse(fs.readFileSync(file, 'utf8'))
  assert.strictEqual(d.model, 'opus'); assert.deepStrictEqual(d.permissions, mine.permissions)
  assert.strictEqual(d.hooks.Stop.length, 2)
  assert.strictEqual(d.hooks.Stop[0].hooks[0].command, 'say done')
  assert.ok(d.hooks.Stop[1].hooks[0].command.endsWith('|| exit 0'))
  assert.ok(fs.readdirSync(path.dirname(file)).some(f => f.includes('agent-buddy-backup')))
})
t('disconnect removes only ours and restores the original shape', () => {
  hooks.disconnect(home)
  const d = JSON.parse(fs.readFileSync(file, 'utf8'))
  assert.deepStrictEqual(d.hooks, { Stop: [{ hooks: [{ type: 'command', command: 'say done' }] }] })
  assert.strictEqual(hooks.status(home).connected, false)
})
t('a broken settings file is never overwritten', () => {
  fs.writeFileSync(file, '{ this is not json')
  assert.throws(() => hooks.connect(home, 'darwin'), /SETTINGS_UNREADABLE/)
  assert.strictEqual(fs.readFileSync(file, 'utf8'), '{ this is not json')
  assert.strictEqual(hooks.status(home).readable, false)
})
console.log(`\n${n} passed`)

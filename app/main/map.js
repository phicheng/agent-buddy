// Turns one Claude Code hook payload into what a critter shows: { key, label, state, text }.
// key   = which critter (one per project folder)
// state = idle | thinking | searching | coding | tool | sleeping | error | done
// Only a short label leaves this function; file contents and command output are never forwarded.
const short = (s, n = 26) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n)
const fileName = p => short(String(p ?? '').split(/[\\/]/).pop(), 22)

const QUIET = new Set(['TodoWrite', 'TodoRead', 'ExitPlanMode', 'ToolSearch', 'TaskCreate', 'TaskUpdate', 'TaskGet', 'TaskList'])

function describeTool(tool, input = {}) {
  tool = String(tool || '')
  if (QUIET.has(tool)) return { state: 'thinking', text: '整理待辦' }
  switch (tool) {
    case 'Read': return { state: 'searching', text: `讀 ${fileName(input.file_path)}` }
    case 'Glob': case 'Grep': case 'LS': return { state: 'searching', text: '找檔案' }
    case 'WebSearch': return { state: 'searching', text: `搜尋：${short(input.query, 18)}` }
    case 'WebFetch': return { state: 'searching', text: '讀網頁' }
    case 'Write': case 'Edit': case 'MultiEdit': case 'NotebookEdit':
      return { state: 'coding', text: `改 ${fileName(input.file_path || input.notebook_path)}` }
    case 'Bash': case 'PowerShell': return { state: 'tool', text: short(input.description) || '執行指令' }
    case 'Task': case 'Agent': return { state: 'thinking', text: '派小幫手去做' }
    case 'AskUserQuestion': return { state: 'idle', text: '等你回答' }
    case 'Skill': return { state: 'thinking', text: '讀做法說明' }
  }
  if (tool.startsWith('mcp__')) {
    const [, server = '', name = ''] = tool.split('__')
    const app = server.replace(/[_-]+/g, ' ').trim().slice(0, 14)
    return /search|list|get|read|query|find|fetch/i.test(name)
      ? { state: 'searching', text: `查 ${app}` }
      : { state: 'tool', text: `用 ${app}` }
  }
  return { state: 'tool', text: `用 ${short(tool, 16)}` }
}

function looksFailed(res) {
  if (!res || typeof res !== 'object') return false
  return res.is_error === true || res.isError === true || res.success === false || (typeof res.error === 'string' && res.error.length > 0)
}

function mapHook(h) {
  if (!h || typeof h !== 'object') return null
  const cwd = typeof h.cwd === 'string' ? h.cwd : ''
  const key = cwd || (typeof h.session_id === 'string' ? h.session_id : '') || 'claude'
  const label = short(cwd ? cwd.replace(/[\\/]+$/, '').split(/[\\/]/).pop() : 'Claude', 14) || 'Claude'
  const base = { key, label }
  switch (h.hook_event_name) {
    case 'SessionStart': return { ...base, state: 'idle', text: '上工了' }
    case 'UserPromptSubmit': return { ...base, state: 'thinking', text: `收到：${short(h.prompt, 16)}` }
    case 'PreToolUse': { const d = describeTool(h.tool_name, h.tool_input || {}); return d && { ...base, ...d } }
    case 'PostToolUse': return looksFailed(h.tool_response) ? { ...base, state: 'error', text: '卡住了，正在想辦法' } : null
    case 'Notification': return { ...base, state: 'idle', text: /permission|approve|允許|同意/i.test(String(h.message || '')) ? '等你按同意' : '等你回覆' }
    case 'Stop': return { ...base, state: 'done', text: '做完了，等你下一個指令' }
    case 'SessionEnd': return { ...base, state: 'sleeping', text: '下班了' }
    default: return null
  }
}

module.exports = { mapHook, describeTool }

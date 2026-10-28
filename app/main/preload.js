const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('buddy', {
  onEvent: fn => ipcRenderer.on('buddy:event', (_e, m) => fn(m)),
  onStatus: fn => ipcRenderer.on('buddy:status', (_e, s) => fn(s)),
  onSelect: fn => ipcRenderer.on('buddy:select', (_e, id) => fn(id)),
  locate: (x, y) => ipcRenderer.invoke('buddy:locate', x, y),
  setInteractive: on => ipcRenderer.send('buddy:interactive', !!on),
  openSettings: agentId => ipcRenderer.send('buddy:open-settings', agentId || null),
  status: () => ipcRenderer.invoke('buddy:status'),
  connect: () => ipcRenderer.invoke('buddy:connect'),
  disconnect: () => ipcRenderer.invoke('buddy:disconnect'),
  setAutostart: on => ipcRenderer.invoke('buddy:autostart', !!on),
  toggleOverlay: () => ipcRenderer.invoke('buddy:toggle-overlay'),
  revealSettingsFile: () => ipcRenderer.invoke('buddy:reveal-settings-file'),
  test: () => ipcRenderer.invoke('buddy:test'),
})

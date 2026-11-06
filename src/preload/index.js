import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('editorApi', {
  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (patch) => ipcRenderer.invoke('config:set', patch),
  openFolder: () => ipcRenderer.invoke('workspace:open'),
  listFiles: () => ipcRenderer.invoke('workspace:list'),
  readFile: (relativePath) => ipcRenderer.invoke('file:read', relativePath),
  writeFile: (relativePath, contents) => ipcRenderer.invoke('file:write', relativePath, contents),
  ask: (payload) => ipcRenderer.invoke('ai:ask', payload),
  edit: (payload) => ipcRenderer.invoke('ai:edit', payload),
  listModels: () => ipcRenderer.invoke('ai:models')
})

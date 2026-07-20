import type { CodexChatApi, ChatSnapshot } from '../shared/chat-contracts.js'

const { contextBridge, ipcRenderer } = require('electron') as typeof import('electron')

const api: CodexChatApi = {
  getState: () => ipcRenderer.invoke('chat:get-state') as Promise<ChatSnapshot>,
  connect: () => ipcRenderer.invoke('chat:connect') as Promise<ChatSnapshot>,
  refreshAllowance: () => ipcRenderer.invoke('chat:refresh-allowance') as Promise<ChatSnapshot>,
  updateSettings: (modelId, reasoningEffort) => ipcRenderer.invoke(
    'chat:update-settings', modelId, reasoningEffort
  ) as Promise<ChatSnapshot>,
  sendMessage: (text) => ipcRenderer.invoke('chat:send', text) as Promise<ChatSnapshot>,
  onStateChanged(listener) {
    const wrapped = (_event: Electron.IpcRendererEvent, snapshot: ChatSnapshot) => listener(snapshot)
    ipcRenderer.on('chat:state-changed', wrapped)
    return () => ipcRenderer.off('chat:state-changed', wrapped)
  }
}

contextBridge.exposeInMainWorld('codexChat', api)

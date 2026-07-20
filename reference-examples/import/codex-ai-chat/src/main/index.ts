import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { app, BrowserWindow, ipcMain } from 'electron'

import { ChatController } from './chat-controller.js'
import { SpawnedCodexAppServerClient } from './codex-app-server-client.js'
import { createWindowManager } from './window-manager.js'

const currentDirectory = dirname(fileURLToPath(import.meta.url))
let controller: ChatController | undefined

function createWindow(): BrowserWindow {
  const preloadPath = join(currentDirectory, '../preload/index.cjs')
  const window = new BrowserWindow({
    width: 860,
    height: 720,
    minWidth: 560,
    minHeight: 520,
    title: 'Codex AI 對話範例',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  window.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error(`Failed to load renderer (${errorCode}): ${errorDescription} — ${validatedURL}`)
  })
  void window.loadFile(join(app.getAppPath(), 'src/renderer/index.html')).catch((error: unknown) => {
    console.error('Failed to open the Codex AI chat window:', error)
  })
  return window
}

const windowManager = createWindowManager(createWindow)

function startApplication(): void {
  const runtimeDirectory = join(app.getPath('userData'), 'codex-runtime')
  mkdirSync(runtimeDirectory, { recursive: true })
  controller = new ChatController({
    createClient: () => new SpawnedCodexAppServerClient(),
    workingDirectory: runtimeDirectory
  })

  ipcMain.handle('chat:get-state', () => controller?.getSnapshot())
  ipcMain.handle('chat:connect', () => controller?.connect())
  ipcMain.handle('chat:refresh-allowance', () => controller?.refreshAllowance())
  ipcMain.handle('chat:update-settings', (_event, modelId: unknown, reasoningEffort: unknown) => {
    if (typeof modelId !== 'string' || typeof reasoningEffort !== 'string') {
      throw new Error('對話設定格式錯誤。')
    }
    return controller?.updateSettings(modelId, reasoningEffort)
  })
  ipcMain.handle('chat:send', (_event, text: unknown) => {
    if (typeof text !== 'string') throw new Error('訊息格式錯誤。')
    return controller?.sendMessage(text)
  })
  controller.onStateChanged((snapshot) => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send('chat:state-changed', snapshot)
    }
  })

  windowManager.open()
}

void app.whenReady().then(startApplication).catch((error: unknown) => {
  console.error('Failed to start the Codex AI chat application:', error)
  app.quit()
})

app.on('activate', () => {
  if (!app.isReady()) return
  windowManager.open()
})
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
app.on('before-quit', () => controller?.close())

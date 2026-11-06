import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { join } from 'node:path'
import { registerHandlers } from './handlers.js'
import { listModels } from '../core/ai.js'

const state = {
  root: null,
  aiBaseUrl: process.env.LOCAL_EDITOR_AI_URL || 'http://127.0.0.1:11434',
  model: process.env.LOCAL_EDITOR_MODEL || '',
  modelError: ''
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    show: true,
    backgroundColor: '#1c1b19',
    title: 'Local Editor',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  if (process.env.ELECTRON_RENDERER_URL) {
    window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    window.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  if (!state.model) {
    try {
      const models = await listModels(state.aiBaseUrl)
      state.model = models[0] || ''
      if (!state.model) state.modelError = 'No models reported by the AI server.'
    } catch (error) {
      state.modelError = error.message
    }
  }

  registerHandlers(ipcMain, {
    dialog,
    getState: () => state,
    setState: (next) => Object.assign(state, next)
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

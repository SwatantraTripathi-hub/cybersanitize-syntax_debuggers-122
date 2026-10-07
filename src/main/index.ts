import { app, BrowserWindow, shell } from 'electron'
import path from 'node:path'
import fs from 'node:fs'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  // Check for compiled preload script (.js or .mjs)
  const preloadJs = path.join(__dirname, '../preload/index.js')
  const preloadMjs = path.join(__dirname, '../preload/index.mjs')
  const preloadPath = fs.existsSync(preloadJs) ? preloadJs : preloadMjs

  mainWindow = new BrowserWindow({
    width: 1380,
    height: 880,
    minWidth: 1080,
    minHeight: 720,
    backgroundColor: '#001E2B',
    show: false,
    title: 'CyberSanitize Enterprise',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  const rendererUrl = process.env.ELECTRON_RENDERER_URL
  if (rendererUrl) {
    mainWindow.loadURL(rendererUrl)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

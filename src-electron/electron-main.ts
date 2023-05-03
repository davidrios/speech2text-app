import { app, BrowserWindow, nativeTheme, Menu, ipcMain, IpcMainInvokeEvent, globalShortcut } from 'electron'
import path from 'path'
import os from 'os'
import fs from 'fs'

// needed in case process is undefined under Linux
const platform = process.platform || os.platform()

try {
  if (platform === 'win32' && nativeTheme.shouldUseDarkColors === true) {
    require('fs').unlinkSync(
      path.join(app.getPath('userData'), 'DevTools Extensions')
    )
  }
} catch (_) {}

let mainWindow: BrowserWindow | undefined

function createWindow () {
  const statePath = path.join(app.getPath('userData'), 'window-state.json')
  let state: Record<string, unknown> = {}
  try {
    state = JSON.parse(fs.readFileSync(statePath, 'utf8'))
  } catch (e) {
  }
  /**
   * Initial window options
   */
  mainWindow = new BrowserWindow({
    icon: path.resolve(__dirname, 'icons/icon.png'), // tray icon
    width: 1000,
    height: 600,
    useContentSize: true,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      // More info: https://v2.quasar.dev/quasar-cli-vite/developing-electron-apps/electron-preload-script
      preload: path.resolve(__dirname, process.env.QUASAR_ELECTRON_PRELOAD)
    }
  })

  mainWindow.loadURL(process.env.APP_URL)

  if (state.bounds != null) {
    mainWindow.setBounds(state.bounds)
  }

  if (process.env.DEBUGGING) {
    // if on DEV or Production with debug enabled
    mainWindow.webContents.openDevTools()
  } else {
    // we're on production; no access to devtools pls
    mainWindow.webContents.on('devtools-opened', () => {
      mainWindow?.webContents.closeDevTools()
    })
  }

  mainWindow.on('closed', () => {
    mainWindow = undefined
  })

  const isMac = process.platform === 'darwin'

  const template = [
    // { role: 'appMenu' }
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    }] : []),
    // { role: 'fileMenu' }
    {
      label: 'File',
      submenu: [
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { type: 'separator' },
        {
          label: 'Settings',
          click () {
            mainWindow?.webContents.send('open-settings')
          }
        }
      ]
    },
    {
      label: 'Actions',
      submenu: [
        {
          label: 'Start/stop voice recording',
          accelerator: 'CommandOrControl+S',
          click () {
            mainWindow?.webContents.send('start-stop-recording')
          }
        }
      ]
    }
  ]

  const menu = Menu.buildFromTemplate(template as any)
  Menu.setApplicationMenu(menu)

  mainWindow.on('resize', saveBoundsSoon)
  mainWindow.on('move', saveBoundsSoon)
  let saveBoundsCookie: any

  function saveBoundsSoon () {
    if (saveBoundsCookie) clearTimeout(saveBoundsCookie)
    saveBoundsCookie = setTimeout(() => {
      saveBoundsCookie = undefined
      state.bounds = mainWindow?.getBounds()
      fs.writeFileSync(statePath, JSON.stringify(state, null, 2))
    }, 1000)
  }
}

app.whenReady().then(() => {
  createWindow()

  // const icon = nativeImage.createFromPath('public/icons/favicon-16x16.png')
  // const tray = new Tray(icon)
  // tray.setToolTip('This is my application')
  // tray.setTitle('This is my title')

  ipcMain.handle('register-global-shortcut',
    async (event: IpcMainInvokeEvent, shortcutString: string | null) => {
      globalShortcut.unregisterAll()

      if (shortcutString == null || shortcutString.length === 0) {
        return true
      }

      const parts = shortcutString.split('+')
      const mainKey = parts.pop() as string
      if (!/[A-Z0-9]|F([1-9]|1[0-9])/.test(mainKey)) {
        return false
      }

      const acceleratorParts = []
      if (parts.indexOf('Ctrl') !== -1) {
        acceleratorParts.push('Control')
      }
      if (parts.indexOf('Alt') !== -1) {
        acceleratorParts.push('Alt')
      }
      if (parts.indexOf('Shift') !== -1) {
        acceleratorParts.push('Shift')
      }

      acceleratorParts.push(mainKey)

      const res = globalShortcut.register(acceleratorParts.join('+'), () => {
        // todo: maybe later
        console.log('shortcut pressed')
      })

      if (!res) {
        console.log('error registering', acceleratorParts.join('+'))
      }

      return res
    })
})

app.on('window-all-closed', () => {
  if (platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (mainWindow === undefined) {
    createWindow()
  }
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

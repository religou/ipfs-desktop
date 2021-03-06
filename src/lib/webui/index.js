import { logo, logger, store } from '../../utils'
import { join } from 'path'
import { screen, BrowserWindow, ipcMain, app, session } from 'electron'
import serve from 'electron-serve'

serve({ scheme: 'webui', directory: `${__dirname}/app` })

const createWindow = (ctx) => {
  const dimensions = screen.getPrimaryDisplay()

  const window = new BrowserWindow({
    title: 'IPFS Desktop',
    icon: logo('ice'),
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hiddenInset',
    fullscreenWindowTitle: 'true',
    width: store.get('window.width', dimensions.width < 1440 ? dimensions.width : 1440),
    height: store.get('window.height', dimensions.height < 900 ? dimensions.height : 900),
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      webSecurity: false,
      allowRunningInsecureContent: false,
      nodeIntegration: process.env.NODE_ENV === 'test'
    }
  })

  window.webContents.on('crashed', event => {
    logger.error('[web ui] crashed: %v', event)
  })

  window.webContents.on('unresponsive', event => {
    logger.warn('[web ui] unresponsive: %v', event)
  })

  window.on('resize', () => {
    const dim = window.getSize()
    store.set('window.width', dim[0])
    store.set('window.height', dim[1])
  })

  window.on('close', (event) => {
    event.preventDefault()
    if (app.dock) app.dock.hide()
    window.hide()
    logger.info('[web ui] window hidden')
  })

  return window
}

export default async function (ctx) {
  const apiAddress = ctx.getIpfsd().apiAddr
  const window = createWindow(ctx)

  ctx.sendToWebUI = (...args) => window.webContents.send(...args)
  ctx.updateWebUI = (url) => {
    window.webContents.send('updatedPage', url)
  }
  ctx.launchWebUI = (url) => {
    logger.info('[web ui] navigate to %s', url)
    window.webContents.send('updatedPage', url)
    window.show()
    window.focus()
    if (app.dock) app.dock.show()
  }

  ipcMain.on('launchWebUI', (_, url) => {
    ctx.launchWebUI(url)
  })

  app.on('before-quit', () => {
    // Makes sure the app quits even though we prevent
    // the closing of this window.
    if (window) window.destroy()
  })

  ipcMain.on('config.get', () => {
    window.webContents.send('config.changed', store.store)
  })

  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    delete details.requestHeaders['Origin']
    callback({ cancel: false, requestHeaders: details.requestHeaders }) // eslint-disable-line
  })

  return new Promise(resolve => {
    window.on('ready-to-show', () => {
      logger.info('[web ui] window ready')
      resolve()
    })

    window.loadURL(`webui://-?api=${apiAddress}&lng=${store.get('language')}#/`)
  })
}

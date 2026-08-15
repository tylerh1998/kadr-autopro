import { app, BrowserWindow, session, protocol, net } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow = null;

// Register custom protocol scheme BEFORE app is ready
// This allows React to do fetch('desktop://api/...') to talk to the main process
protocol.registerSchemesAsPrivileged([{
  scheme: 'desktop',
  privileges: {
    standard: true,
    secure: true,
    supportFetchAPI: true,
    corsEnabled: true,
    allowServiceWorkers: false
  }
}]);

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'AutoPro Desktop',
    icon: path.join(app.getAppPath(), 'public', 'icon.ico'),
    webPreferences: {
      // No preload needed! We use custom protocol instead.
      webSecurity: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Remove the default menu bar for a cleaner app-like feel
  mainWindow.setMenuBarVisibility(false);

  // Allow all third-party cookies globally
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    let modifiedHeaders = details.responseHeaders;
    if (modifiedHeaders && modifiedHeaders['Set-Cookie']) {
      modifiedHeaders['Set-Cookie'] = modifiedHeaders['Set-Cookie'].map((cookie) => {
        return cookie.replace(/SameSite=(Lax|Strict)/gi, 'SameSite=None')
                     .replace(/;/g, '; ')
                     + (cookie.toLowerCase().includes('secure') ? '' : '; Secure');
      });
    }
    callback({ cancel: false, responseHeaders: modifiedHeaders });
  });

  // Load the live Vercel URL
  mainWindow.loadURL('https://test.kensauto.ca');

  // Pipe renderer console to main process stdout for debugging
  mainWindow.webContents.on('console-message', (event, level, message) => {
    console.log(`[Renderer] ${message}`);
  });

  mainWindow.webContents.on('did-finish-load', () => {
    console.log('[Main] Page loaded successfully.');
  });
}

app.whenReady().then(() => {
  // Register the custom protocol handler (currently a no-op scaffold; no active routes).
  protocol.handle('desktop', async (request) => {
    const url = new URL(request.url);
    console.log(`[Main] Protocol request: ${url.pathname}`);

    return new Response('Not found', { status: 404 });
  });

  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

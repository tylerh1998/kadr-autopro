import { app, BrowserWindow, session } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'AutoPro Desktop',
    icon: path.join(__dirname, '../public/icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      // Important: Disable webSecurity to allow cross-origin requests and iframe embedding if needed
      webSecurity: false,
      webviewTag: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Remove the default menu bar for a cleaner app-like feel
  mainWindow.setMenuBarVisibility(false);

  // Allow all third-party cookies globally
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    // If the server sends Set-Cookie, modify it so it doesn't block due to SameSite/Secure policies in Electron
    let modifiedHeaders = details.responseHeaders;
    if (modifiedHeaders && modifiedHeaders['Set-Cookie']) {
      modifiedHeaders['Set-Cookie'] = modifiedHeaders['Set-Cookie'].map((cookie) => {
        // Strip SameSite=Lax/Strict and add SameSite=None; Secure to ensure it works across origins
        return cookie.replace(/SameSite=(Lax|Strict)/gi, 'SameSite=None')
                     .replace(/;/g, '; ')
                     + (cookie.toLowerCase().includes('secure') ? '' : '; Secure');
      });
    }
    callback({ cancel: false, responseHeaders: modifiedHeaders });
  });

  // Load the live Vercel URL
  const targetUrl = 'https://test.kensauto.ca';
  
  mainWindow.loadURL(targetUrl);

  // Open DevTools if running in dev mode
  // if (process.env.VITE_DEV_SERVER_URL) {
  //   mainWindow.webContents.openDevTools();
  // }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

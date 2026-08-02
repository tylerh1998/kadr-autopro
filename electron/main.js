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
  // Register the custom protocol handler.
  // React code can now do: fetch('desktop://api/get-cart-text')
  // and get the iframe text content back as JSON.
  protocol.handle('desktop', async (request) => {
    const url = new URL(request.url);
    console.log(`[Main] Protocol request: ${url.pathname}`);

    if (url.pathname === '/get-cart-text' || url.pathname === '//api/get-cart-text') {
      if (!mainWindow || mainWindow.isDestroyed()) {
        return new Response(JSON.stringify({ error: 'Window not available' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }

      try {
        const frames = mainWindow.webContents.mainFrame.frames;
        console.log(`[Main] Searching ${frames.length} frames for supplier content...`);

        for (const frame of frames) {
          console.log(`[Main] Frame URL: ${frame.url}`);
          if (
            frame.url.includes('prolink.napacanada.com') ||
            frame.url.includes('napaprolink.ca') ||
            frame.url.includes('partstech.com') ||
            frame.url.includes('napa.ca')
          ) {
            const text = await frame.executeJavaScript('document.body.innerText');
            console.log(`[Main] Extracted ${text.length} characters from supplier frame.`);
            return new Response(JSON.stringify({ text }), {
              headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
            });
          }
        }

        return new Response(JSON.stringify({ error: 'Could not find the supplier iframe. Make sure the supplier page is loaded.' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      } catch (err) {
        console.error('[Main] Extraction error:', err);
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }
    }

    // Health check endpoint — React can call this to verify desktop mode
    if (url.pathname === '/ping' || url.pathname === '//api/ping') {
      return new Response(JSON.stringify({ ok: true, version: app.getVersion() }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

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

const { contextBridge, ipcRenderer } = require('electron');

console.log("[PRELOAD] Script is executing!");

// Expose a flag to the window object so the React app knows it is running in Electron
contextBridge.exposeInMainWorld('__IS_DESKTOP__', true);

// Expose secure IPC messaging to the React app
contextBridge.exposeInMainWorld('desktopAPI', {
  getCartText: () => ipcRenderer.invoke('get-cart-text')
});

// Fallback message listener in case contextBridge is blocked by the frontend
window.addEventListener('message', async (event) => {
  if (event.data && event.data.type === 'GET_CART_TEXT') {
    try {
      const text = await ipcRenderer.invoke('get-cart-text');
      window.postMessage({ type: 'CART_TEXT_RESULT', text }, '*');
    } catch (e) {
      window.postMessage({ type: 'CART_TEXT_ERROR', error: e.message }, '*');
    }
  }
});

console.log("[PRELOAD] Successfully exposed desktopAPI and message listeners!");

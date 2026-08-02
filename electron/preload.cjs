const { contextBridge, ipcRenderer } = require('electron');

// Expose a flag to the window object so the React app knows it is running in Electron
contextBridge.exposeInMainWorld('__IS_DESKTOP__', true);

// Expose secure IPC messaging to the React app
contextBridge.exposeInMainWorld('desktopAPI', {
  getCartText: () => ipcRenderer.invoke('get-cart-text')
});

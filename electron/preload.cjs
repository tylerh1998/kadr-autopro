const { contextBridge } = require('electron');

// Expose a flag to the window object so the React app knows it is running in Electron
contextBridge.exposeInMainWorld('__IS_DESKTOP__', true);

// Optionally, we could expose safe IPC messaging here in the future
// contextBridge.exposeInMainWorld('desktopAPI', {
//   doSomething: () => ipcRenderer.invoke('do-something')
// });

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    minimizeWindow: () => ipcRenderer.invoke('window-minimize'),
    maximizeWindow: () => ipcRenderer.invoke('window-maximize'),
    isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
    closeWindow: () => ipcRenderer.invoke('window-close'),
    openOverlay: () => ipcRenderer.send('open-overlay'),
    closeOverlay: () => ipcRenderer.send('close-overlay'),
    resizeOverlay: (dims) => ipcRenderer.send('resize-overlay', dims),
    blurWindow: () => ipcRenderer.send('blur-window'),
    notifyUpdate: () => ipcRenderer.send('ui-update-trigger'),
    onUpdate: (callback) => ipcRenderer.on('ui-update', callback),
    onOverlayClosed: (callback) => ipcRenderer.on('overlay-closed', callback),
    // Selection Window
    openSelectionWindow: () => ipcRenderer.send('open-selection-window'),
    closeSelectionWindow: () => ipcRenderer.send('close-selection-window'),
    // Window Selection Window
    openWindowSelectionWindow: () => ipcRenderer.send('open-window-selection-window'),
    closeWindowSelectionWindow: () => ipcRenderer.send('close-window-selection-window')
});


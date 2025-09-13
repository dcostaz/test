'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    onReceiveCbzImages: (callback) => ipcRenderer.on('receive-cbz-images', callback)
});

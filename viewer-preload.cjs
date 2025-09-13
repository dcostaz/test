'use strict';

const { contextBridge, ipcRenderer } = require('electron');

/** @type {IpcApi} */
const api = {};

/** @type {(callback: IpcCallback) => () => void} */
api[`onReceiveCbzImages`] = (callback) => {
    /** @type {(event: unknown, ...args: IpcApiArgs) => void} */
    const listener = (...args) => callback(...args);
    ipcRenderer.on(`receive-cbz-images`, listener);
    return () => ipcRenderer.removeListener(`receive-cbz-images`, listener);
};

contextBridge.exposeInMainWorld('viewerAPI', api);

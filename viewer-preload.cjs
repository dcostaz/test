'use strict';

const { contextBridge, ipcRenderer } = require('electron');

/** @type {IpcApi} */
const api = {};

/** @type {(...args: IpcApiArgs) => Promise<void>} */
api.getInitialChapter = () => ipcRenderer.invoke('get-initial-chapter');

/** @type {(...args: IpcApiArgs) => Promise<void>} */
api.getChapter = (...args) => ipcRenderer.invoke('get-chapter', ...args);

/** @type {(callback: IpcCallback) => () => void} */
api.onInitialChapterData = (callback) => {
    /** @type {(event: unknown, ...args: IpcApiArgs) => void} */
    const listener = (event, ...args) => callback(...args);
    ipcRenderer.on('initial-chapter-data', listener);
    return () => ipcRenderer.removeListener('initial-chapter-data', listener);
};

/** @type {(callback: IpcCallback) => () => void} */
api.onChapterLoaded = (callback) => {
    /** @type {(event: unknown, ...args: IpcApiArgs) => void} */
    const listener = (event, ...args) => callback(...args);
    ipcRenderer.on('chapter-loaded', listener);
    return () => ipcRenderer.removeListener('chapter-loaded', listener);
};

contextBridge.exposeInMainWorld('viewerAPI', api);

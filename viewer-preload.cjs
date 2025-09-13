'use strict';

const { contextBridge, ipcRenderer } = require('electron');

/** @type {IpcApi} */
const api = {};

/** @type {() => Promise<void>} */
api.getInitialChapter = () => ipcRenderer.invoke('get-initial-chapter');

/** @type {(chapterIndex: number) => Promise<void>} */
api.getChapter = (chapterIndex) => ipcRenderer.invoke('get-chapter', { chapterIndex });

/** @type {(callback: (data: { images: string[]; chapter: string; chapterList: string[]; currentIndex: number; }) => void) => () => void} */
api.onInitialChapterData = (callback) => {
    const listener = (event, ...args) => callback(...args);
    ipcRenderer.on('initial-chapter-data', listener);
    return () => ipcRenderer.removeListener('initial-chapter-data', listener);
};

/** @type {(callback: (data: { images: string[]; chapter: string; chapterList: string[]; currentIndex: number; }) => void) => () => void} */
api.onChapterLoaded = (callback) => {
    const listener = (event, ...args) => callback(...args);
    ipcRenderer.on('chapter-loaded', listener);
    return () => ipcRenderer.removeListener('chapter-loaded', listener);
};

contextBridge.exposeInMainWorld('viewerAPI', api);

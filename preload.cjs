'use strict';
const __root = require('app-root-path').path;
const path = require('path');

/** @type {UtilsConstructor} - Utils Class static members. */
const Utils = require(path.join(__root, 'utils', 'utils.cjs'));

const { contextBridge, ipcRenderer } = require('electron');
const { ipcRegistry, ipcDataRegistry } = require('./ipcRegistry.cjs');

/** @type {IpcApi} */
const api = {};

// Case 1: Send methods (fire-and-forget) & Case 4: Invoke-style messages (request-response)
for (const [channel, config] of Object.entries({ ...ipcRegistry, ...ipcDataRegistry }).filter(([_, cfg]) => cfg.context === 'api')) {
  const methodName = Utils.kebabToCamel(channel);
  const channelConfig = /** @type {IpcConfig} */ (config);

  /** @type {(...args: IpcApiArgs) => Promise<void>} */
  api[methodName] = (...args) => {
    if (Utils.isIpcConfig(channelConfig) && channelConfig.validateArgs && !channelConfig.validateArgs(args)) {
      return Promise.reject(new Error(`Invalid arguments for ${channel}`));
    }
    if (channelConfig.requiresResponse) {
      return ipcRenderer.invoke(channel, ...args); // request-response
    } else {
      ipcRenderer.send(channel, ...args); // fire-and-forget
      return Promise.resolve();
    }
  };
}

// Case 2 & 3: Event listeners (done & failed)
for (const [channel] of Object.entries(ipcRegistry).filter(([_, cfg]) => cfg.context === 'api')) {
  const baseName = Utils.kebabToCamel(channel, true);

  /** @type {(callback: IpcCallback) => () => void} */
  api[`on${baseName}Done`] = (callback) => {
    /** @type {(event: unknown, ...args: IpcApiArgs) => void} */
    const listener = (_, ...args) => callback(...args);
    ipcRenderer.on(`${channel}-done`, listener);
    return () => ipcRenderer.removeListener(`${channel}-done`, listener);
  };

  /** @type {(callback: IpcCallback) => () => void} */
  api[`on${baseName}Failed`] = (callback) => {
    /** @type {(event: unknown, ...args: IpcApiArgs) => void} */
    const listener = (_, ...args) => callback(...args);
    ipcRenderer.on(`${channel}-failed`, listener);
    return () => ipcRenderer.removeListener(`${channel}-failed`, listener);
  };
}

// One-off methods. Not tied to a specific channel.

/**
 * Request review window.
 */
api['openReviewWindow'] = () => ipcRenderer.send('open-review-window');
/**
 * Toggle Dev tools.
 */
api['toggleDevTools'] = () => ipcRenderer.send('toggle-dev-tools');

/**
 * Open cbz Viewer.
 */
api['openCbzViewer'] = (record) => ipcRenderer.invoke('open-cbz-viewer', record);

/** @type {(callback: IpcCallback) => () => void} */
api['onCBZViewerClosed'] = (callback) => {
  /** @type {(event: unknown, ...args: IpcApiArgs) => void} */
  const listener = (event, ...args) => callback(...args);
  ipcRenderer.on('cbz-viewer-closed', listener);
  return () => ipcRenderer.removeListener('cbz-viewer-closed', listener);
};

// Log API Registry
console.log('IPC API initialized:', api);

// Expose to renderer
contextBridge.exposeInMainWorld('api', api);

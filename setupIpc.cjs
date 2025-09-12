'use strict';
const __root = require('app-root-path').path;
const path = require('path');

const { ipcMain } = require('electron');
const { ipcRegistry, ipcDataRegistry } = require('./ipcRegistry.cjs');

const fsExists = require('fs').existsSync; // Use existsSync for synchronous check

/** @type {UtilsConstructor} - Utils Class static members. */
const Utils = require(path.join(__root, 'cls', 'utils.cjs'));

const GLOBAL_LOGGING = true;

/**
 * @param {boolean | IpcConfig} config
 * @returns {boolean}
 */
function logEnabled(config) {
    return GLOBAL_LOGGING && (config === true || (config && config.log == true));
}

/**
 * @template T
 * @param {T} instance - The class instance (e.g. manga)
 * @param {keyof T} key - The method name to invoke
 * @param {...any} args - Arguments to pass to the method
 * @returns {Promise<unknown>} - Result of the method call
 */
function invokeRegistryMethod(instance, key, ...args) {
    const method = instance[key];

    if (typeof method !== 'function') {
        console.warn(`Method "${String(key)}" is not a function on instance`);
        return Promise.resolve(false);
    }

    try {
        return Promise.resolve(method.apply(instance, args));
    } catch (error) {
        console.error(`Error invoking "${String(key)}":`, error);
        return Promise.resolve(false);
    }
}

/**
 * @param {string} channel
 * @param {boolean | IpcConfig} config
 * @returns {string}
 */
function resolveMethodName(channel, config) {
    return typeof config === 'object' && config.name ? config.name : channel;
}

/** @param {MangaClass} manga - Holds reference to a Manga instance. */
function setupIpcEvents(manga) {
    /** @type {string[]} */
    const validKeys = Utils.getClassMethodNames(manga);

    /** @type {string[]} */
    const registryKeys = [
        ...Object.entries(ipcRegistry).map(([key, val]) => (typeof val === 'object' && val.name ? val.name : key)),
        ...Object.entries(ipcDataRegistry).map(([key, val]) => (typeof val === 'object' && val.name ? val.name : key))
    ];

    for (const key of registryKeys) {
        if (!validKeys.includes(/** @type {keyof MangaClass} */(key))) {
            console.warn(`"${key}" is not a valid method on MangaClass`);
            continue;
        }

        const method = manga[/** @type {keyof MangaClass} */(key)];
        if (typeof method !== 'function') {
            console.warn(`"${key}" exists but is not a callable method on MangaClass`);
        }
    }   

    for (const [channel, config] of Object.entries(ipcRegistry)) {
        const methodName = resolveMethodName(channel, config);

        ipcMain.on(channel, async (event, ...args) => {
            if (logEnabled(config)) console.log(`****** ${channel} triggered ******`);

            try {
                const result = await invokeRegistryMethod(manga, /** @type {keyof MangaClass} */(methodName), ...args);
                const suffix = result === false ? 'failed' : 'done';
                event.sender.send(`${channel}-${suffix}`, ...args);
            } catch (error) {
                const normalized = Utils.normalizeError(error);
                console.error(`IPC error on "${channel}":`, normalized.stack || normalized);
                event.sender.send(`${channel}-failed`, ...args);
            }
        });
    }

    for (const [channel, config] of Object.entries(ipcDataRegistry)) {
        const methodName = resolveMethodName(channel, config);

        ipcMain.handle(channel, async (_, ...args) => {
            if (logEnabled(config)) console.log(`****** ${channel} triggered ******`);

            try {
                const result = await invokeRegistryMethod(manga, /** @type {keyof MangaClass} */(methodName), ...args);
                return result ?? {};
            } catch (error) {
                const normalized = Utils.normalizeError(error);
                console.error(`IPC handle error on "${channel}":`, normalized.stack || normalized);
                return {};
            }
        });
    }
}

module.exports = { setupIpcEvents };
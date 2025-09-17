'use strict';
const __root = require('app-root-path').path;
const path = require('path');

/**
 * IPC registry for command-based channels.
 * Each entry maps an IPC channel name to its configuration.
 * @type {Object.<string, IpcConfig>}
 */
const ipcRegistry = {
    'reload-manga-updates-reading-list': {
        context: 'api',
        log: true,
        name: 'reloadMangaUpdatesReadingList',
        validateArgs: () => true,
        requiresResponse: false
    },
    'reload-manga-reading-list': {
        context: 'api',
        log: true,
        name: 'reloadMangaReadingList',
        validateArgs: () => true,
        requiresResponse: false
    },
    'reload-hakuneko-list': {
        context: 'api',
        log: true,
        name: 'reloadHakunekoList',
        validateArgs: () => true,
        requiresResponse: false
    },
    'sync-reading-list': {
        context: 'api',
        log: true,
        name: 'syncReadingList',
        validateArgs: () => true,
        requiresResponse: false
    },
    'resolve-unmatched-entry': {
        context: 'api',
        log: true,
        name: 'resolveUnmatchedEntry',
        type: "IpcApiResolveUnmatchedEntry",
        parameterType: "IpcApiArgsResolveUnmatchedEntry",
        parameters: "[id: number, selectedEntry: mangaReviewItemObj]",
        validateArgs: (id, selectedEntry) => true,
        requiresResponse: false,
        callbackType: '(id: number, selectedEntry: mangaReviewItemObj) => void'
    },
    'remove-unmatched-entry': {
        context: 'api',
        log: true,
        name: 'removeUnmatchedEntry',
        type: "IpcApiRemoveUnmatchedEntry",
        parameterType: "IpcApiArgsRemoveUnmatchedEntry",
        parameters: "[id: number]",
        validateArgs: (id) => true,
        requiresResponse: false,
        callbackType: '(id: number) => void'
    },
    'update-manga-chapter': {
        context: 'api',
        log: true,
        type: "IpcApiUpdateMangaChapter",
        parameterType: "IpcApiArgsUpdateMangaChapter",
        parameters: "[key: string, newChapter: number]",
        name: 'updateMangaChapter',
        validateArgs: () => true,
        requiresResponse: false,
        callbackType: '(key: string, newChapter: number) => void'
    }
};

/**
 * IPC registry for data/request-based channels.
 * Each entry maps an IPC channel name to its configuration.
 * @type {Object.<string, IpcConfig>}
 */
const ipcDataRegistry = {
    'get-manga-image': {
        context: 'api',
        log: false,
        name: 'getMangaImage',
        validateArgs: () => true,
        requiresResponse: true,
        returnType: "string|null"
    },
    'get-hakuneko-reading-list': {
        context: 'api',
        log: true,
        name: 'getHakunekoReadingList',
        validateArgs: () => true,
        requiresResponse: true,
        returnType: "Record<string, mangaHakuneko>"
    },
    'get-unmatched-from-reading-list': {
        context: 'api',
        log: true,
        name: 'getUnmatchedFromReadingList',
        validateArgs: () => true,
        requiresResponse: true,
        returnType: "mangaSerieReviewitemObj[]"
    },
    'search-manga-updates-serie-by-id': {
        context: 'api',
        log: true,
        name: 'searchMangaUpdatesSerieByID',
        type: "IpcApiSearchMangaUpdatesSerieByID",
        parameterType: "IpcApiArgsSearchMangaUpdatesSerieByID",
        parameters: "[seriesID: number, useCache?: boolean]",
        validateArgs: (...args) => {
            const [seriesID, useCache] = /** @type {IpcApiArgsSearchMangaUpdatesSerieByID} */ (args[0]);
            return (
                typeof seriesID === 'number' && (useCache === undefined || typeof useCache === 'boolean')
            );
        },
        requiresResponse: true,
        returnType: "MangaUpdatesSeriesResultEntry"
    },
    'search-manga-updates-serie-by-name': {
        context: 'api',
        log: true,
        name: 'searchMangaUpdatesSerieByName',
        type: "IpcApiSearchMangaUpdatesSerieByName",
        parameterType: "IpcApiArgsSearchMangaUpdatesSerieByName",
        parameters: "[seriesTitle: string, useCache?: boolean]",
        validateArgs: (...args) => {
            const [seriesTitle, useCache] = /** @type {IpcApiArgsSearchMangaUpdatesSerieByName} */ (args[0]);
            return (
                typeof seriesTitle === 'string' && seriesTitle.trim() !== '' && (useCache === undefined || typeof useCache === 'boolean')
            );
        },
        requiresResponse: true,
        returnType: "MangaUpdatesSearchSeriesResultEntry[]"
    }
};

// Store the flowerbox markup for this callback type
const typeDocs = new Map();
typeDocs
    .set('api', '    /**\n     * Extends the global `Window` interface to include the `api` object,\n     * which provides methods for interacting with the manga reading list,\n     * synchronizing data, handling unmatched entries, and managing UI actions.\n     *\n     * The `api` object exposes asynchronous methods for fetching and reloading\n     * various manga lists, synchronizing data, resolving or removing unmatched entries,\n     * and opening developer tools or review windows.\n     *\n     * It also provides event subscription methods for handling the completion or failure\n     * of these operations, allowing callbacks to be registered and unsubscribed.\n     */')
    .set('IpcConfig', '  /**\n   * IPC configuration interface for defining the structure and metadata of IPC methods.\n   *\n   * @property log - Whether to log the IPC call.\n   * @property name - The name of the Manga class method to resolve.\n   * @property type - The type name for the IPC method.\n   * @property parameterType - The type name for the IPC method parameters.\n   * @property parameters - The type definition for the IPC method parameters (as a string).\n   * @property validateArgs - Function to validate arguments before IPC call.\n   * @property requiresResponse - Whether the IPC call expects a response.\n   * @property returnType - Expected return type of the IPC call (as a string).\n   * @property callbackType - Expected type signature of the callback for event-based IPC channels (as a string).\n   */')
    .set('IpcApi', '/**\n * Represents a generic IPC (Inter-Process Communication) API interface.\n *\n * This interface allows dynamic assignment of functions to string keys,\n * where each function can accept any number of arguments of any type and return any value.\n */')
    .set('IpcApiArgs', '/**\n * Represents the arguments passed to IPC API methods.\n *\n * This type is an array of unknown values, allowing for flexibility in the number and types of arguments.\n */')
    .set('IpcApiResponse', '/**\n * Represents the response from an IPC API method.\n *\n * This type is a Promise that resolves to the expected return type of the IPC API method.\n */')
    .set('IpcCallback', '  /**\n   * Callback type for generic IPC events.\n   *\n   * @param args - Arguments passed from the IPC event.\n   */')

    .set('IpcApiResolveUnmatchedEntry', '/**\n * IPC API method for resolving an unmatched manga entry.\n *\n * This method accepts arguments defined in `IpcApiArgsResolveUnmatchedEntry` and performs the resolution of the unmatched entry.\n *\n * @param args - The arguments for the API method.\n * @returns A promise that resolves when the operation is complete.\n */')
    .set('IpcApiArgsResolveUnmatchedEntry', '/**\n * Represents the arguments for resolving an unmatched manga entry.\n *\n * @property id - The ID of the unmatched entry.\n * @property selectedEntry - The selected review item object.\n */')
    .set('resolveUnmatchedEntryCallback', '  /**\n   * Callback type for resolving unmatched entries.\n   *\n   * @param id - The ID of the unmatched entry.\n   * @param selectedEntry - The selected review item object.\n   */')
  
    .set('IpcApiRemoveUnmatchedEntry', '/**\n * IPC API method for removing an unmatched manga entry.\n *\n * This method accepts arguments defined in `IpcApiArgsRemoveUnmatchedEntry` and performs the removal of the unmatched entry.\n *\n * @param args - The arguments for the API method.\n * @returns A promise that resolves when the operation is complete.\n */')
    .set('IpcApiArgsRemoveUnmatchedEntry', '/**\n * Represents the arguments for removing an unmatched manga entry.\n *\n * @property id - The ID of the unmatched entry.\n */')
    .set('removeUnmatchedEntryCallback', '  /**\n   * Callback type for removing unmatched entries.\n   *\n   * @param id - The ID of the unmatched entry.\n   */')

    .set('IpcApiUpdateMangaChapter', '/**\n * IPC API method for updating a manga chapter.\n *\n * This method accepts arguments defined in `IpcApiArgsUpdateMangaChapter` and performs the update of the manga chapter.\n *\n * @param args - The arguments for the API method.\n * @returns A promise that resolves when the operation is complete.\n */')
    .set('IpcApiArgsUpdateMangaChapter', '/**\n * Represents the arguments for updating a manga chapter.\n *\n * @property key - The unique key of the manga entry to update.\n * @property newChapter - The new chapter number to set.\n */')
    .set('updateMangaChapterCallback', '  /**\n   * Callback type for updating a manga chapter.\n   *\n   * @param key - The unique key of the manga entry to update.\n   * @param newChapter - The new chapter number to set.\n   */')

    .set('IpcApiSearchMangaUpdatesSerieByID', '/**\n * IPC API method for searching a Manga Updates series by its unique ID.\n *\n * This method accepts arguments defined in `IpcApiArgsSearchMangaUpdatesSerieByID` and returns a promise\n * that resolves to a `MangaUpdatesSeriesResultEntry` object containing the series details.\n *\n * @param args - The arguments for the API method.\n * @returns A promise that resolves to the series details.\n */')
    .set('IpcApiArgsSearchMangaUpdatesSerieByID', '/**\n * Represents the arguments for searching a Manga Updates series by ID.\n *\n * @property seriesID - The unique identifier of the manga series to search for.\n * @property useCache - Optional boolean indicating whether to use cached data if available.\n */')

    .set('IpcApiSearchMangaUpdatesSerieByName', '/**\n * IPC API method for searching a Manga Updates series by its title.\n *\n * This method accepts arguments defined in `IpcApiArgsSearchMangaUpdatesSerieByName` and returns a promise\n * that resolves to an array of `MangaUpdatesSearchSeriesResultEntry` objects containing the series details.\n *\n * @param args - The arguments for the API method.\n * @returns A promise that resolves to the series details.\n * };\n */')
    .set('IpcApiArgsSearchMangaUpdatesSerieByName', '/**\n * Represents the arguments for searching a Manga Updates series by name.\n *\n * @property seriesTitle - The title of the manga series to search for.\n * @property useCache - Optional boolean indicating whether to use cached data if available.\n */');

module.exports = { ipcRegistry, ipcDataRegistry, typeDocs };
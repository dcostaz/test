'use strict';
const __root = require('app-root-path').path;
const path = require('path');

/** @type {EnumsConstructor} - Enums class Static Elements. */
const Enums = require(path.join(__root, 'enums', 'mangalist.cjs'));

const fs = require("fs").promises;
const Stats = require("fs").Stats;

const { Low } = require('lowdb');
const { JSONFile } = require('lowdb/node');
const _ = require('lodash');

const { levenshteinEditDistance } = require('levenshtein-edit-distance');
const similarity = require('similarity');

const template = require('string-placeholder');

/** @typedef {import('redis').RedisClientType} RedisClientType */
const redis = require('redis');
const { console } = require('inspector');
const { crc32 } = require('zlib');

/** @type {SettingsConstructor} - Settings class Static Elements. */
const Settings = require(path.join(__root, 'cls', 'settings.cjs'));

/** @type {MangaListConstructor} - MangaList class Static Elements. */
const MangaList = require(path.join(__root, 'cls', 'mangalist.cjs'));

/** @type {HakunekoConstructor} - Hakuneko class Static Elements. */
const Hakuneko = require(path.join(__root, 'cls', 'hakuneko.cjs'));

/** @type {MangaUpdatesConstructor} - MangaUpdates Class Static Elements.*/
const MangaUpdates = require(path.join(__root, 'cls', 'mangaupdates.cjs'));

/** @type {UtilsConstructor} - Utils Class static members. */
const Utils = require(path.join(__root, 'utils', 'utils.cjs'));

class Manga {
    /**
     * Constructor for Manga class.
     * @param {MangaParameters} args - Configuration options.
     */
    constructor(args) {
        // Destructure the arguments
        const { db, settings, mangalist, hakuneko, mangaupdates } = args;

        /** @type {Low<MangaDBDefaults>} - Manga database.*/
        this.db = db;

        /** @type {SettingsClass} - Reference to an instance of Settings.*/
        this.settings = settings;

        /** @type {string} - Path to manga directory. */
        this.path = this.settings.mangalist.manga.directoryPathName;

        /** @type {MangaUpdatesClass|undefined} - Reference to an instance of MangaUpdates.*/
        this.mangaupdates = mangaupdates;

        /** @type {MangaListClass|undefined} - Reference to an instance of MangaList.*/
        this.mangalist = mangalist;

        /** @type {HakunekoClass|undefined} - Reference to an instance of Hakuneko.*/
        this.hakuneko = hakuneko;
    }

    /**
     * Factory function to perform initialization steps and return an instance of Manga.
     * @param {object} [options] - Optional parameters for initialization.
     * @param {boolean} [options.doGetDirectories] - Whether to get directories from the manga-list settings. Defaults to false.
     * @param {boolean} [options.doSortByDate] - Whether to sort directories by date modified. Defaults to true.
     * @param {boolean} [options.doStripTimestamp] - Whether to strip timestamps from directory names. Defaults to false.
     * @returns {Promise<Manga>} A promise that resolves to an instance of Manga or null if initialization fails.
     * @static
     */
    static async init(options = { doGetDirectories: false, doSortByDate: true, doStripTimestamp: false }) {
        // Deconstruct options
        let { doGetDirectories, doSortByDate, doStripTimestamp } = options;

        /** @type {SettingsClass} - Settings Class. */
        let _settings = await Settings.init();

        // Get Redis host and port from settings
        const redisHost = _settings.redis.environment[_settings.redis.default];

        // Creat a Redis client connection
        const _redisclient = redis.createClient({
            url: `redis://${redisHost.host}:${redisHost.port}`,
        });

        await _redisclient.connect();

        /** @type {any} */
        const jsonValue = _settings.redis;

        await _redisclient.json.set('settings', '$', jsonValue);

        // Get the reference to the manga-list settings
        const mangalist = _settings.mangalist;

        if (!mangalist || !mangalist.database || !mangalist.database.directoryPathName)
            throw new Error('(init) manga-list settings not found or database path is missing.');

        // Get the path for the manga database
        /** @type {string} - Directory where JSON databases are located.*/
        const databaseDir = path.join(mangalist.database.directoryPathName, mangalist.database.manga);

        // Create adapter for file
        /** @type {JSONFile<MangaDBDefaults>} - Adapter for the Manga JSON file. */
        const dbAdapter = new JSONFile(databaseDir);

        /** @type {MangaDBDefaults} - Default tables for the manga database. */
        const dbDefaultData = { directories: [], readinglist: [], hakuneko: Object.create(null), mangahakunekomatching: [], mangahakunekonotmatching: [], unmatchedfromreadinglist: [], hakunekotomangaupdateslist: [], readinglistdiscrepancies: [] };

        // Setup the connection db to the JSON settings file
        /** @type {Low<dbDefaultData>} - References the settings database. */
        const _db = new Low(dbAdapter, dbDefaultData);

        // If the db connection not setup, return null
        if (!_db)
            throw new Error('(init) Failed to load database.');

        // Load and initialize db tables if not already present
        await _db.read();

        // Make sure that the database existing or create it
        for (const key in dbDefaultData) {
            if (!(key in _db.data)) {
                _db.data[key] = dbDefaultData[key];

                // Ensure all are written to the database
                await _db.write();
            }
        }

        // Build the Manga parameters object
        /** @type {MangaParameters} - Parameters for initializing Manga. */
        const mangaParams = { db: _db, settings: _settings };

        /** @type {Manga} - Instance of the Manga class. */
        let mangaInstance = Object.create(null);
        try {
            // Create a new instance of Manga with the initialized database and settings
            mangaInstance = new Manga(mangaParams);
        } catch (error) {
            throw new Error(`(init) Error creating Manga instance: ${error}`);
        }

        // Update the manga directories from the manga path
        await mangaInstance.updateDirectories();

        /** @type {HakunekoClass} - Hakuneko instance. */
        mangaInstance.hakuneko = await Hakuneko.init(mangaInstance.settings);

        /** @type {MangaUpdatesClass} - MangaUpdates instance. */
        mangaInstance.mangaupdates = await MangaUpdates.init(mangaInstance.settings);

        /** @type {MangaListClass} - MangaList instance. */
        mangaInstance.mangalist = await MangaList.init(mangaInstance.settings, mangaInstance.mangaupdates);

        await mangaInstance.addNewSeries();

        await mangaInstance.buildMangaHakuneko();

        // Return a new instance of Manga with the initialized database and settings
        return mangaInstance;
    }

    /**
     * Static method to get directories from a source path.
     * This method reads the directories from the source path and returns an array of directory objects.
     * @param {mangaListDirectoryEntry[]} existingDirectories - An array of existing directories to compare against.
     * @param {string} srcPath - The source path to read directories from.
     * @param {boolean} [sortByDate=true] - Whether to sort the directories by date modified.
     * @param {boolean} [stripTimestamp=false] - Whether to strip the timestamp from the directory names.
     * @param {mangaListDirectoryEntry[]} [modifiedDirectories=[]] - An array of modified directories to include in the results.
     * @returns {Promise<mangaListDirectoryEntry[]>} - A promise that resolves to an array of directory objects.
     * Each object contains the directory name, last modified date, and last chapter.
     * @private
     */
    async _getDirectories(existingDirectories, srcPath, sortByDate = true, stripTimestamp = false, modifiedDirectories = []) {
        /**
         * Static method to get the maximum chapter from a directory
         * @param {string} dirPath
        */
        const getMaxChapterFromDirectory = async function (dirPath) {
            // Check if directory PathName is provided
            if (!dirPath) {
                console.log('No directory path provided.');
                throw new Error();
            }

            // Read the directory entries
            // Use fs.promises.readdir to read the directory entries
            const files = await fs.readdir(dirPath);

            // Initialize maxChapter to a very low value
            // This will be used to find the maximum chapter number
            let maxChapter = -Infinity;

            // Loop through each file in the directory
            // and using the regular expression to find chapter numbers
            // Update maxChapter with the highest chapter number is found
            for (const file of files) {
                const match = file.match(Utils.CHAPTERREGEX);
                if (match && match[2]) {
                    const chapterNum = parseFloat(match[2]);
                    if (!isNaN(chapterNum)) {
                        maxChapter = Math.max(maxChapter, chapterNum);
                    }
                }
            }

            // If no valid chapter number found, throw error
            if (!isFinite(maxChapter))
                throw new Error();

            // Return the maximum chapter number found
            return maxChapter;
        }

        // Check if directory PathName is provided
        if (!srcPath) {
            console.log('No directory path provided.');
            return [];
        }

        // Read the directory entries
        // Use fs.promises.readdir to read the directory entries in the source path
        /** @type {DirectoryEntry[]} - Direcotory entries for specified path. */
        let entries = []

        // Contain any directory that no longer exists in the source path
        /** @type {Set<any>} */
        let removedEntries;

        try {
            // Read the directory entries with file types
            try {
                entries = await fs.readdir(srcPath, { withFileTypes: true });
            } catch (error) {
                console.log(`(_getDirectories) Failed to read files in directory ${srcPath}`);
                throw new Error('Path not found.');
            }

            // If any directories were removed, log them
            // This will help to identify directories that were removed from the source path
            /** @type {Set<any>} - Map of current directory names. */
            const currentNames = new Set(entries.filter(dirent => dirent.isDirectory()).map(dirent => dirent.name));

            /** @type {mangaListDirectoryEntry[]} - Directories not found in path but exist in existingDirectories. */
            const removed = existingDirectories.filter(dir => !currentNames.has(dir.name));

            /** @type {Set<any>} - Map of removed directory names. */
            removedEntries = new Set(removed.map(dir => dir.name));
            if (removed.length > 0)
                console.log('Removed directories:', removed.map(dir => dir.name));

            // Remove entries from 'entries' that already exist in existingDirectories and have not been modified
            // 'modifiedDirectories' is an array of objects with a 'name' property
            // Build Sets for fast lookup
            /** @type {Set<any>} - Map of modified directory names. */
            const modifiedNames = new Set(modifiedDirectories.map(dir => dir.name));

            /** @type {mangaListDirectoryEntry[]} - Existing directories that are not modified or removed. */
            const filteredExistingDirectories = [];

            /** @type {Set<any>} - Map of existing directory names for quick lookup. */
            const existingNames = new Set();

            // Filter existingDirectories and build existingNames Set in one pass
            for (const dir of existingDirectories) {
                if ((modifiedNames.size > 0 && !modifiedNames.has(dir.name)) || removedEntries.has(dir.name)) {
                    filteredExistingDirectories.push(dir);
                    existingNames.add(dir.name);
                }
            }
            /*            for (const dir of existingDirectories) {
                            if ((modifiedNames.size === 0 || !modifiedNames.has(dir.name)) && !removedEntries.has(dir.name)) {
                                filteredExistingDirectories.push(dir);
                                existingNames.add(dir.name);
                            }
                        }
            */
            // Filter entries in a single pass.
            // This will filter out entries that are not directories, already exist in existingDirectories,
            // or have been modified or removed.
            entries = entries.filter(dirent =>
                dirent.isDirectory() && !existingNames.has(dirent.name)
            );

            // Filter unwanted directories
            entries = entries.filter(dir => !dir.name.includes("#recycle")); // Filter unwanted directories

        } catch (err) {
            console.error('Error reading directory:', err);
            /** @type {mangaListDirectoryEntry[]} - Empty directory list. */
            const emptyDirectories = [];
            return emptyDirectories;
        }

        /** @type {mangaListDirectoryEntry[]} - Direcotory entries for specified path. */
        let dirsWithStats = [];

        try {
            dirsWithStats = await Promise.all(
                entries
                    .filter(dirent => dirent.isDirectory())
                    .map(async dirent => {
                        // Get entry from the existingDirectories array if it exists
                        // If it doesn't exist, use an empty object
                        /** @type {mangaListDirectoryEntry | {}} */
                        const entry = existingDirectories.find(e => e.name === dirent.name) || {};

                        // Get the full path of the directory
                        // Use path.join to create the full path of the directory
                        /** @type {string} - The full path of the directory. */
                        const fullPath = path.join(srcPath, dirent.name);

                        // Get the stats of the directory
                        // Use fs.promises.stat to get the stats of the directory
                        /** @type {Stats} - The stats of the directory. */
                        let stats = Object.create(null);
                        try {
                            stats = await fs.stat(fullPath);
                        } catch (error) {
                            console.log('(_getDirectories) Failed to stat folder. Skipping. Error: ', error);
                            return Object.create(null); // No need to update
                        }

                        // Get the directory stats date and time in ISO format
                        // This will be used to update the last modified date
                        /** @type {string} - The last modified date of the directory in ISO 8601 date format. */
                        const modifiedDate = stats.mtime.toISOString();

                        // Only check time if an entry exists in existingDirectories
                        // If the entry exists and its mtime is greater than or equal to the directory's mtime,
                        // then we don't need to update it
                        if (entry && Object.values(entry).length > 0)
                            if ('mtime' in entry && typeof entry.mtime === 'string' && new Date(entry.mtime) >= new Date(modifiedDate))
                                return Object.create(null); // No need to update

                        // NOTE: If it gets to this point, it means the directory has changed
                        // Update the last modified date in the entry and the last chapter

                        // Get the last chapter from the directory
                        // Use the static method to get the maximum chapter from the directory
                        /** @type {number} - The last chapter number from the directory. */
                        let lChapter = 0;
                        try {
                            lChapter = await getMaxChapterFromDirectory(fullPath);
                        } catch (error) {
                            lChapter = Number(undefined); // If no chapters found, set to NaN
                        }

                        // Build the directory entry object
                        /** @type {mangaListDirectoryEntry} - The directory entry object. */
                        const directoryEntry = {
                            name: dirent.name, // Directory name
                            key: Utils.folderNameToSlug(dirent.name), // Create a slug from the directory name
                            mtime: modifiedDate, // Last modified date in ISO format
                            lastChapter: lChapter // Last chapter number
                        };

                        // Return the directory name, last modified date, and last chapter
                        return directoryEntry;
                    })
            );
        } catch (err) {
            console.error('Error reading directories:', err);
        }

        // Filter out null entries (directories that haven't changed).
        dirsWithStats = dirsWithStats.filter(dir => Object.keys(dir).length > 0);

        // Filter out entries that have been removed.
        // This will remove any directories that have been removed from the source path.
        existingDirectories = existingDirectories.filter(dir => !removedEntries.has(dir.name));

        // Initialize an empty array for directories results.
        // This will hold the directories with their last modified date and last chapter.
        // If no directories found, return an empty array.
        /** @type {mangaListDirectoryEntry[]} - Array of directories with their last modified date and last chapter. */
        let directories = [];

        // If no directories found, return an empty array.
        if (!dirsWithStats || !dirsWithStats.length)
            return removedEntries.size === 0 ? directories : existingDirectories;

        // Remove entries in dirsWithStats from existingDirectories.
        // Create a Set of existing directory names for quick lookup.
        // This will help to filter out directories that have have updated.
        /** @type {Set<any>} - Map of updated directory names. */
        const updatedNames = new Set(dirsWithStats.map(dir => dir.name));

        // Filter existing directories to keep only those not in updatedNames.
        // This will ensure that we only keep directories that have not been updated.
        // and combine them with the newly found directories.
        directories = existingDirectories.filter(dir => !updatedNames.has(dir.name));
        directories = directories.concat(dirsWithStats);

        // Optional: sort directories by date modified.
        if (sortByDate)
            directories = directories.sort((a, b) => new Date(b.mtime ?? 0).getTime() - new Date(a.mtime ?? 0).getTime()); // latest first

        // Optional: map directories to remove mtime.
        // If stripTimestamp is true, we will remove the mtime property from the directories.
        //if (stripTimestamp)
        //    directories = directories.map(({ mtime, ...rest }) => rest); // Only remove mtime, keep the rest of the properties

        // Return the directories
        return directories;
    }

    /**
     * Update the directories in the database.
     * This method reads the directories from the source path and updates the database with the new directories.
     * @param {mangaListDirectoryEntry[]} [modifiedDirectories=[]] - An array of modified directories to include in the results.
     * @param {object} [options={}] - Optional parameters for updating directories.
     * @param {boolean} [options.doSortByDate] - Whether to sort the directories by date modified. Default is true.
     * @param {boolean} [options.doStripTimestamp] - Whether to strip the timestamp from the directory names. Default is false.
     * @returns {Promise<void>} - A promise that resolves when the directories have been updated.
     */
    async updateDirectories(modifiedDirectories = [], options = { doSortByDate: true, doStripTimestamp: false }) {
        // Get options
        const { doSortByDate, doStripTimestamp } = options;

        // If the db connection, data, or table not available, return
        if (!this.db || !this.db.data || !this.db.data.directories)
            return console.log('Table directories not found in the database.');

        // Make we have the latest data from the database
        await this.db.read();

        // Get the existing directories from the database
        /** @type {mangaListDirectoryEntry[]} - Existing directories from the database. */
        const existingDirectories = this.db.data.directories;

        /**
         * If the directories have already been scanned and saved then populate
         * the modifiedDirectories to limit the directory scan
         */
        /** @type {mangaListDirectoryEntry[]} - Directories that have changed since last run. */
        let _modifiedDirectories = modifiedDirectories;

        // If no modified directories are provided, perform a search for modified directories
        if (_modifiedDirectories && _modifiedDirectories.length === 0)
            _modifiedDirectories = await this.getModifiedDirectories(existingDirectories);

        // Use a Promise to handle the asynchronous operation
        // This will allow us to wait for the directories to be updated
        await new Promise(async (resolve) => {
            // Ensure all directories have a key property

            /** @type {boolean} - Flag to indicate if any directory was modified. */
            let directoryModified = false;

            // Iterate over existing directories and ensure each has a key property
            // This is necessary to ensure that each directory has a unique identifier
            existingDirectories.forEach(dir => {
                // If the directory is an object and has a name property but no key property
                if (typeof dir === 'object' && dir.name && !dir.hasOwnProperty('key')) {
                    // The key is always derived from the folder name
                    dir.key = Utils.folderNameToSlug(dir.name);
                    directoryModified = true; // Mark as modified
                }
            });

            // If any directory was modified, we need to write the changes to the database
            if (directoryModified) {
                // Write the changes to the database
                await this.db.write();
            }

            // Refresh the manga directories
            /** @type {mangaListDirectoryEntry[]} - Modified directories that have been updated. */
            const directories = await this._getDirectories(
                existingDirectories, // Use the existing directories from the database
                this.path, // Use the manga directory path from settings
                // Use the options provided
                doSortByDate,
                doStripTimestamp,
                _modifiedDirectories
            );

            // if no new directories found, log a message based on the existing directories
            // and do not update the database
            if (!directories || !directories.length) {
                if (existingDirectories && existingDirectories.length)
                    console.log('No new directories found, keeping existing ones.');
                else
                    console.log('Could not load manga directories from Local Storage or it is empty.');
            }
            else {
                // Update the database with the new directories
                // This will overwrite the existing directories with the new ones
                this.db.data.directories = directories || [];

                // write directories to temp database
                await this.db.write();

                console.log('Directories updated successfully.');
            }

            // Resolve the promise to indicate that the directories have been updated
            resolve(null);

        }).catch(err => {
            console.error('Error updating directories:', err);

        });
    }

    /**
     * Get the directories from the database.
     * This method reads the directories from the database and returns an array of directory objects.
     * Each object contains the directory key, name, last modified date, and last chapter.
     * If a search key is provided, it will return the directory that matches the search key.
     * @param {string} [searchKey] - Optional search key to filter directories by their slug.
     * @returns {Promise<mangaListDirectoryEntry[]>} - A promise that resolves to an array of directory objects.
     */
    async mangaDirectories(searchKey) {
        if (!this.db)
            return [];

        // Make sure we have the latest data from the database
        await this.db.read();

        /** @type {mangaListDirectoryEntry[]} - Existing directories from the database. */
        const directories = this.db.data.directories;

        /** @type {mangaListDirectoryEntry[]} - Directory entries that matches the search key. */
        let foundDirectory = [];

        if (searchKey && searchKey.trim() !== '') {
            // If searchText is provided, filter the directories based on the search text
            /** @type {mangaListDirectoryEntry|undefined} - Directory entry that matches the search key. */
            const found = directories.find(entry => entry.key === searchKey);

            // Only add those with a match
            if (found)
                foundDirectory.push(found);
        }

        // Return the directories
        return foundDirectory || directories;
    }

    /**
     * Function that returns modified directories
     * It will read the directories from the database
     * @param {mangaListDirectoryEntry[]} existingDirectories - Directories already scanned from manga directory.
     *  @returns {Promise<mangaListDirectoryEntry[]>} - Filtered directories that have been modified.
    */
    async getModifiedDirectories(existingDirectories) {
        // Get the existing directories from the database
        /** @type {boolean[]} - Directory has been modified. true/false. */
        const results = await Promise.all(
            existingDirectories.map(async dirEntry => {
                /** @type {string} - The full path of the directory. */
                const fullPath = path.join(this.path, dirEntry.name);
                /** @type {Stats} - The stats of the directory. */
                let stats = Object.create(null);
                try {
                    stats = await fs.stat(fullPath);
                } catch (error) {
                    console.log('(getModifiedDirectories) Failed to stat folder. Skipping. Error: ', error);
                    return false;
                }

                /** @type {string} - The last modified date of the directory in ISO 8601 date format. */
                const modifiedDate = stats.mtime.toISOString();

                // If the entry exists and its mtime is greater than or equal to the directory's mtime,
                // then we don't need to include it in the modified list
                if (dirEntry && Object.values(dirEntry).length > 0) {
                    if (dirEntry.mtime && new Date(dirEntry.mtime).getTime() >= new Date(modifiedDate).getTime())
                        return false; // Not modified
                }
                return true; // Modified
            }));

        /** @type {mangaListDirectoryEntry[]} - Filtered directories that have been modified. */
        const modifiedDirectories = existingDirectories.filter((_, idx) => results[idx])

        // Return the modified directories
        return modifiedDirectories;
    }

    /**
     * Dry function to build serieDetailObj
     * Prepare, if available, the object with the selected option for serie detail
     * @template {{ [key: string]: unknown }} T
     * @param {T} serialDetail
     * @returns {mangaSerieDetail}
     * @static
     */
    static serieDetailObj(serialDetail) {
        if (typeof serialDetail !== 'object' || serialDetail === null || Object.keys(serialDetail).length === 0 || !serialDetail.key)
            return Object.create(null);

        return /** @type {mangaSerieDetail} */ ({
            key: serialDetail.key,
            id: serialDetail?.id || null,
            title: serialDetail?.title || '',
            url: serialDetail?.url || '',
            chapter: serialDetail?.chapter || 1,
            volume: serialDetail?.volume || null,
            userRating: serialDetail?.userRating || null,
            lastChapter: serialDetail?.lastChapter || null,
            associatedTitles: serialDetail?.associatedTitles || [],
            directory: serialDetail?.directory || '',
            alias: serialDetail?.alias || '',
            mangaupdatesTitleMatch: serialDetail?.mangaupdatesTitleMatch || '',
            year: serialDetail?.year || null,
            completed: serialDetail?.completed || false,
            type: serialDetail?.type || '',
            status: serialDetail?.status || ''
        });
    };

    /**
     * Dry function to build serieDetailObj
     * Prepare, if available, the object with the selected option for serie detail
     * @param {MangaUpdatesReadingListSearchResultsEntry} readingItem
     * @param {SerieDetailExtras} other
     * @returns {mangaSerieDetail}
     * @static
     */
    static serieDetailFromReadingList(readingItem, other) {
        /** @type {string[]} */
        const serieDetailAssociatedTitles = [];

        // Build a new series entry from reading list item.
        /** @type {mangaSerieDetail} - Slug of the manga title. */
        const serieDetail = {
            key: other.key,
            id: readingItem.record.series.id,
            title: readingItem.record.series.title,
            url: readingItem.record.series.url,
            chapter: readingItem.record.status.chapter,
            volume: readingItem.record.status.volume,
            userRating: readingItem.metadata.user_rating,
            lastChapter: readingItem.metadata.series?.latest_chapter || NaN,
            associatedTitles: serieDetailAssociatedTitles,
            directory: other?.directory,
            alias: other?.alias,
            mangaupdatesTitleMatch: other?.mangaupdatesTitleMatch,
            year: other?.year,
            completed: other?.completed,
            type: other?.type,
            status: other?.status
        };

        return serieDetail;
    }

    /**
     * Template for Logging Reading List Operations
     * @readonly
     * @static
     */
    static MangaReadingListTemplate = Object.freeze('{prefix}ID: {id}, TITLE: {title}, ALIAS: {alias}, DIRECTORY: {directory}{sufix}');

    /**
     * Start process to find new series by scraping [MangaList] mangaupdates reading list
     * Then add them to the [Manga] reading list
     * It will skip series that are already in the reading list
     * It will also add series to the review list if it cannot find a match
     *
     * This handles the primary scenario for adding new series without user intervention
     * @this {Manga}
     * @returns {Promise<void>}
     * @example
     *      // With the intance of Manga class
     *      await instance.addNewSeries();
     *
     *      // Locally from the class
     *      await this.addNewSeries();
     * @async
     */
    async addNewSeries() {
        // If hakuneko instance not available just return
        if (!this.mangalist?.db || !this.db) return;

        /**
         * Get data from database
         */

        // Assign instance db to local variable
        const db = this.db;

        // Make sure it's up to date
        await db.read();

        // Assign hakuneko instance database to local variable, reserving the use of db to for local class database
        /** @type {Low<any>} */
        const mangalistDB = this.mangalist.db;

        // Make sure it's up to date
        await mangalistDB.read();

        // Set to "false"; no writing to the database on completion
        let updated = false;

        // Let's track number of errors to take action after "n" errors
        const MAX_ERRORS = 2;
        let errorCount = 0;

        /** Directories for manga
         * @type {mangaListDirectoryEntry[]} - Reference to [Manga] [directories] */
        const directories = db.data.directories;

        /** Prepare a Set of normalized directory names for fast lookup
         * @type {Set<string>} */
        const directoryLookUp = new Set(directories.map(str => Utils.normalizeText(str.name)));

        /** Manga reading list
         * @type {mangaReadingList[]} - Reference to [Manga] [readinglist] */
        const mangaReadingList = db.data.readinglist;

        /** Manga review list
        * @type {mangaSerieReviewitemObj[]} - Reference to [Manga] [unmatchedfromreadinglist] */
        const mangaReviewList = db.data.unmatchedfromreadinglist;

        /** Source "MangaUpdates" reading list
          * @type {mangaupdatesReadingList[]} - Reference to [MangaUpdates] [readinglist] */
        const mangaupdatesReadingList = mangalistDB.data.readinglist;

        /* Disabled for now. TODO: Add a menu option in UI
            // Force keys to always match the slug of the directory
            if (await syncKeysWithDirectory(db.data.mangaupdatesreadinglist)) {
                await db.write();
                console.log('Keys sync has been saved.')
            }

            // Corrects image files name when the comparison of both matches
            const imageDir = path.join(__dirname, 'images/manga/');
            if (!await renameImageFilesToMatchKeys(db, imageDir)) {
                console.log('No image file has been changed.');
            }
        */

        for (const readingItem of mangaupdatesReadingList) {
            const seriesTitle = readingItem?.record?.series?.title;

            /** @type {mangaReadingItems} */
            const readingItems = {
                readingItem: readingItem, // Reading list item from MangaUpdates reading list
                reviewItem: Object.create(null), // Selected option for serie in review
                directories: directories, // Manga directories
                directoryLookUp: directoryLookUp, // Lookup set for directories
                readingList: mangaReadingList, // List of series
                reviewList: mangaReviewList // List of series in review
            };

            // 1) Get the series details from the reading item
            const { status, serieDetail, serieReview } = await this.getReadingListSerieDetail(readingItems);

            // Get serie detail returned an error status
            if (status === Enums.GET_READINGLIST_SERIEDETAIL_STATUS.ERROR) {
                // Increment error count by 1
                errorCount++;

                // Abort processing
                if (errorCount > MAX_ERRORS) {
                    console.log(`Aborting processing due to errors exceeding Max: ${MAX_ERRORS} allowed`);
                    break;
                }

                // Skip to next
                continue;
            }

            // Reset error counter for any other status
            errorCount = 0

            // Serie has already been added to reading list
            if (status === Enums.GET_READINGLIST_SERIEDETAIL_STATUS.SKIPPED) continue;

            // An error occurred when getting details from MangaUpdates
            else if (status === Enums.GET_READINGLIST_SERIEDETAIL_STATUS.FAILED_GET) continue;

            // No details were returned for serie from MangaUpdates
            else if (status === Enums.GET_READINGLIST_SERIEDETAIL_STATUS.NO_DETAILS) continue;

            // Serie is in queued for review
            else if (status === Enums.GET_READINGLIST_SERIEDETAIL_STATUS.IN_REVIEW) continue;

            // 2) Save unmatched entry for review (troubleshooting)
            if ((status === Enums.GET_READINGLIST_SERIEDETAIL_STATUS.FOR_REVIEW) && (serieReview && Object.keys(serieReview).length !== 0)) {
                // Add the serie to the review database
                mangaReviewList.push(serieReview);

                // Make sure we set the flag so we know we updated the database
                updated = true;

                // Log message
                console.log(Manga.createLogMessage(Manga.MangaReadingListTemplate, {
                    prefix: '*',
                    id: readingItem.record.series.id,
                    title: seriesTitle,
                    sufix: ' (Set for review)'
                }));

                // Skip forward to the next serie
                continue;
            }

            // 3) If we have a directory, add the series to the database
            if ((status === Enums.GET_READINGLIST_SERIEDETAIL_STATUS.SUCCESS) && (serieDetail && Object.keys(serieDetail).length !== 0)) {
                // 3.1 - Add the serie to the [Manga] database [readinglist] table
                mangaReadingList.push(serieDetail);

                // 3.2 - Remove reading list entry from [unmatchedfromreadinglist] table

                // Look for id in [unmatchedfromreadinglist] table
                const idx = mangaReviewList.findIndex(entry => entry.id === serieDetail.id);

                // If index not -1, continue to remove from [unmatchedfromreadinglist] table
                if (idx !== -1) {
                    // Get the entry from unmatchedfromreadinglist
                    const entry = mangaReviewList[idx];
                    const id = entry.readingItem.record.series.id;

                    if (mangaReadingList.find(obj => obj.id === id)) {
                        mangaReviewList.splice(idx, 1);
                    }
                }

                // Set the flag so we know we updated the database.
                // This will be used to write the database only once at the end
                updated = true;

                // Log message
                console.log(Manga.createLogMessage(Manga.MangaReadingListTemplate, {
                    prefix: ''.concat('+', serieDetail.mangaupdatesTitleMatch, ' '),
                    id: serieDetail.id,
                    title: serieDetail.title,
                    alias: serieDetail.alias,
                    directory: serieDetail.directory,
                    sufix: ' (Added to Manga Reading List)'
                }));

                await Utils.wait(1000); // Optional: throttle requests

            }
        }

        // If we have updated the database, write it.
        // This will ensure we only write once at the end of the loop
        if (updated) {
            // Ensure all changes are written to the database
            await db.write();

            console.log('New series written to database.');
        } else {
            console.log('No new series added to the database.');
        }
    }

    /** Dry function to build readingItemObj
     * Limits the structure to only the properties needed
     * This matches the structure of a single item from temp.data.readinglist
     * Single element from the results of https://api.mangaupdates.com/v1/lists/:id/search
     * @example
     * for single readingItem:
     * "results": [
     *     {
     *         "record": {
     *             "series": {
     *                 "id": 27558584427,
     *                 "url": "https://www.mangaupdates.com/series/cnro3u3/the-stellar-swordmaster",
     *                 "title": "The Stellar Swordmaster"
     *             },
     *             "list_id": 0,
     *             "status": {
     *                 "volume": 1,
     *                 "chapter": 6
     *             },
     *             "priority": 255,
     *             "time_added": {
     *                 "timestamp": 1751295165,
     *                 "as_rfc3339": "2025-06-30T14:52:45+00:00",
     *                 "as_string": "June 30th, 2025 2:52pm UTC"
     *             }
     *         },
     *         "metadata": {
     *             "series": {
     *                 "bayesian_rating": 7.9,
     *                 "latest_chapter": 81,
     *                 "last_updated": {
     *                     "timestamp": 1750905803,
     *                     "as_rfc3339": "2025-06-26T02:43:23+00:00",
     *                     "as_string": "June 26th, 2025 2:43am UTC"
     *                 }
     *             },
     *             "user_rating": null
     *         }
     *     },
     * ]
     *
     * @param {MangaUpdatesReadingListSearchResultsEntry} readingItem
     * @returns {mangaReadingItemObj}
     * @static
     */
    static buildReadingItemObj = (readingItem) => {
        if (typeof readingItem !== 'object' || readingItem === null || Object.keys(readingItem).length === 0)
            return Object.create(null);

        let returnObj;
        try {
            returnObj = {
                record: {
                    series: {
                        id: readingItem.record.series.id,
                        url: readingItem.record.series.url,
                        title: readingItem.record.series.title
                    },
                    list_id: readingItem.record.list_id,
                    status: {
                        chapter: readingItem.record.status.chapter,
                        volume: readingItem.record.status.volume
                    }
                },
                metadata: {
                    series: {
                        latest_chapter: readingItem.metadata.series?.latest_chapter || NaN
                    },
                    user_rating: readingItem.metadata.user_rating
                }
            }
        } catch (error) {
            console.error('Error building reading item object:', error);
            return Object.create(null);
        }

        return returnObj;
    };

    /** Dry function to build reviewItemObj
     * Prepare, if available, the object with the selected option for serie in review
     * @example
     * const reviewitem = buildReviewItemObj(
     * {
     *     title: title,
     *     normalized: normalized,
     *     directory: directory,
     *     key: titleToSlug(directory),
     * }
     * );
     *
     * @param {mangaReviewItemObj} reviewItem
     * @returns {mangaReviewItemObj}
     * @static
     */
    static buildReviewItemObj = (reviewItem) => {
        if (typeof reviewItem !== 'object' || reviewItem === null || Object.keys(reviewItem).length === 0)
            return Object.create(null);

        return {
            titleMatch: reviewItem.titleMatch,
            title: reviewItem.title,
            normalized: reviewItem.normalized,
            directory: reviewItem.directory,
            key: reviewItem.key
        };
    };

    /** Get the serie detail for a single entry from the mangaupdates reading list
     * This function has two modes:
     *  1) get serie by direct match
     *  2) get serie from review selection
     * @example
     *      const readingItems = {
     *           readingItem: readingItem, // Reading list item from MangaUpdates reading list
     *           reviewItem: Object.create(null), // Selected option for serie in review
     *           directories: directories, // Manga directories
     *           directoryLookUp: directoryLookUp, // Lookup set for directories
     *           readingList: mangaReadingList, // List of series
     *           reviewList: mangaReviewList // List of series in review
     *       };
     *
     *      or
     *
     *      const readingItems = {
     *           readingItem: readingItem, // Reading list item from MangaUpdates reading list
     *           reviewItem: Object.create(null), // Selected option for serie in review
     *           directories: directories, // Manga directories
     *           readingList: mangaReadingList, // List of series
     *           reviewList: mangaReviewList // List of series in review
     *       };
     *
     *       // Get the series details from the reading item
     *       const { status, serieDetail, serieReview } = await this.getReadingListSerieDetail(readingItems);
     *
     * @param {mangaReadingItems} readingItems
     * @returns {Promise<GetReadingListSerieDetailResult>}
     * @async
     */
    async getReadingListSerieDetail(readingItems) {
        if (!readingItems) {
            console.log('Invalid parameters provided to addSerie function.');
            return { status: Enums.GET_READINGLIST_SERIEDETAIL_STATUS.ERROR };
        }

        // 0) Prepare overall elements required to process the series
        //
        // Objects to be returned
        /** @type {GetReadinglistSeriedetailStatus} */
        let status = Enums.GET_READINGLIST_SERIEDETAIL_STATUS.SUCCESS; // This will hold the serie details if needed

        /** @type {mangaSerieDetail} */
        let serieDetail = Object.create(null); // This will hold the review object if needed

        /** @type {mangaSerieReviewitemObj} */
        let serieReview = Object.create(null);

        // Prepare the readingItem object from readingItems
        const readingItem = Manga.buildReadingItemObj(readingItems.readingItem);

        // Prepare, if available, the object with the selected option for serie in review
        const reviewItem = Manga.buildReviewItemObj(readingItems.reviewItem);

        // Prepare the manga directories
        /** @type {mangaListDirectoryEntry[]} */
        const directories = readingItems.directories;

        // Prepare a Set of lowercase and normalized directory names for fast lookup
        // Set(directories)
        const directoryLookUp = readingItems.directoryLookUp || new Set(directories.map(str => Utils.normalizeText(str.name)));

        // Prepare list of series
        /** @type {mangaReadingList[]} */
        const readingList = readingItems.readingList;

        // Prepare list of series in review
        /** @type {mangaSerieReviewitemObj[]} */
        const reviewList = readingItems.reviewList;

        if (!readingItem || Object.keys(readingItem).length === 0 || !readingItem.record || !readingItem.record.series) {
            console.log('Invalid reading item provided to getReadingListSerieDetail function.');
            console.log('Reading item:', readingItems.readingItem?.record?.series?.title);
            return { status: Enums.GET_READINGLIST_SERIEDETAIL_STATUS.ERROR };
        }

        // Get the series title and normalize it
        let seriesTitle = readingItem.record.series.title;
        const normalizedSeriesTitle = Utils.normalizeText(seriesTitle);

        // 1) Check if this series already exists in the DB
        const alreadyExists = readingList.some(
            obj => Utils.normalizeText(obj.title) === normalizedSeriesTitle
        );
        if (alreadyExists) {
            // Return if already present
            return { status: Enums.GET_READINGLIST_SERIEDETAIL_STATUS.SKIPPED };
        }

        // 2) If the serie is in review status, skip it
        //    This is to avoid reprcessing series that are already in review
        //    If reviewItem is provided, we are performing the revision
        /** @type {mangaSerieReviewitemObj[]} */
        const serieInReview = reviewList.filter(function (obj) { return obj.id === readingItem.record.series.id }).filter(Boolean);
        if ((serieInReview && serieInReview.length !== 0) && (Object.keys(reviewItem).length === 0)) {
            // Log message
            console.log(Manga.createLogMessage(Manga.MangaReadingListTemplate, {
                prefix: ''.concat('*'),
                id: readingItem.record.series.id,
                title: seriesTitle,
                sufix: ' (In review)'
            }));

            // Return if the serie is already in review
            return { status: Enums.GET_READINGLIST_SERIEDETAIL_STATUS.IN_REVIEW };
        }

        // 3) Lookup MangaUpdates for full series details
        /** @type {MangaUpdatesSeriesResultEntry} */
        let serie = Object.create(null);
        try {
            if (!this.mangaupdates || !(this.mangaupdates instanceof MangaUpdates))
                throw new Error('Mangaupdates instance not available.');

            serie = await this.mangaupdates.getSerieDetail(readingItem.record.series.id);

        } catch (error) {
            console.error(`Error getting series detail "${readingItem?.record?.series?.title || 'Unknown'}":`, error);

            // Return on error
            return { status: Enums.GET_READINGLIST_SERIEDETAIL_STATUS.FAILED_GET };
        }

        // If no serie details were found in MangaUpdates, log the series and continue
        if (!serie || Object.keys(serie).length === 0) {
            // Log message
            console.log(Manga.createLogMessage(Manga.MangaReadingListTemplate, {
                prefix: ''.concat('*'),
                id: readingItem.record.series.id,
                title: seriesTitle,
                sufix: ' (No details found)'
            }));

            // Return if no serie details found
            return { status: Enums.GET_READINGLIST_SERIEDETAIL_STATUS.NO_DETAILS };
        }

        // Fields to be added to serieDetail from serie
        const completeSerieDetailFields = ['year', 'completed', 'type', 'status'];

        // Initialize variables for directory, key, alias, and title match type
        let key = ''; // Key must be empty until we find a match with a directory
        let directory = ''; // Directory will be assigned the matched directory
        let alias = ''; // Alias will be empty unless we find a match with an associated title
        /** @type {MangaupdatesTitleMatch} */
        let mangaupdatesTitleMatch = Enums.MANGAUPDATES_TITLE_MATCH.TITLE_NO_MATCH; // Default to no title match

        // Build associated titles array with normalized and slugged keys
        // This will be used to check for associated titles later
        // This will also be used to log the associated titles for review
        const associatedTitles = serie.associated.map(obj => Manga.buildReviewItemObj({
            titleMatch: Enums.MANGAUPDATES_TITLE_MATCH.ASSOCIATED_TITLE,
            title: obj.title,
            normalized: Utils.normalizeText(obj.title),
            directory: obj.title, // Use the title as directory assuming it is a direct match
            key: Utils.folderNameToSlug(obj.title) // Always use the directory as key to match Hakuneko key
        }));

        // Flag that indicates if its not a direct match, we will save it for review. Reset to false for each serie
        let pendingReviewMatch = false;

        // 3) Check for a direct directory match (exact or similar)
        /** @type {mangaReviewItemObj[]} */
        let similarTitlesMatches = [];

        let matchSuccesfull = false;

        const normalizedReviewDirectory = Utils.normalizeText(reviewItem?.directory);
        const matchTitle = normalizedReviewDirectory || normalizedSeriesTitle;
        if (directoryLookUp.has(matchTitle)) {
            // Try exact match first
            const directoryFound = directories.find(dir => Utils.normalizeText(dir.name) === matchTitle);
            if (directoryFound) {
                directory = directoryFound.name;
                alias = reviewItem.directory ? reviewItem.directory : alias; // If reviewDirectory is provided, we are in review mode
                key = reviewItem.key ? reviewItem.key : Utils.folderNameToSlug(directory); // Always use the directory name as key to match Hakuneko key
                mangaupdatesTitleMatch = reviewItem.titleMatch ? reviewItem.titleMatch : Enums.MANGAUPDATES_TITLE_MATCH.TITLE_MATCH; // If reviewDirectory is provided, we are in review mode

                // Title match was successfull
                matchSuccesfull = true;
            }
        } else {
            // Try similar match using Levenshtein and similarity
            const similarDir = directories.find(dir => {
                const normDir = Utils.normalizeText(dir.name);
                return (
                    levenshteinEditDistance(normDir, normalizedSeriesTitle) <= 10 &&
                    similarity(normDir, normalizedSeriesTitle) >= 0.85
                );
            });
            if (similarDir) {
                // Set additional properties for review
                mangaupdatesTitleMatch = Enums.MANGAUPDATES_TITLE_MATCH.TITLE_SIMILAR;

                // Store the similar directory match for review
                const reviewItemObj = Manga.buildReviewItemObj({
                    titleMatch: mangaupdatesTitleMatch,
                    title: seriesTitle,
                    normalized: normalizedSeriesTitle,
                    directory: similarDir.name,
                    key: similarDir.key // Always use the directory name as key to match Hakuneko key
                });
                similarTitlesMatches.push(reviewItemObj);

                pendingReviewMatch = true; // This is a similar match, we will save it for review
            }
        }

        // 4) Check associated titles for a directory if no direct match was found
        if (!matchSuccesfull) {
            // If we didn't find a directory match yet, check associated titles
            if (Array.isArray(serie.associated)) {
                // Try to find a unique associated title with a directory (direct match)
                const associatedTitlesMatches = associatedTitles.filter(at => directoryLookUp.has(at.normalized));

                if (associatedTitlesMatches.length > 0) {
                    associatedTitlesMatches.forEach(match => {
                        const associateDirectory = directories.find(dir => Utils.normalizeText(dir.name) === match.normalized);

                        if (associateDirectory) {
                            // Set additional properties for review
                            mangaupdatesTitleMatch = Enums.MANGAUPDATES_TITLE_MATCH.ASSOCIATED_TITLE;

                            const reviewItemObj = Manga.buildReviewItemObj({
                                titleMatch: mangaupdatesTitleMatch,
                                title: match.title,
                                normalized: match.normalized,
                                directory: associateDirectory.name,
                                key: associateDirectory.key
                            });
                            similarTitlesMatches.push(reviewItemObj);

                            pendingReviewMatch = true; // Possible associated title matches, needs review
                        }
                    });

                } else if (associatedTitlesMatches.length === 0) {
                    // Try fuzzy match using levenshteinEditDistance and similarity
                    const fuzzyMatches = associatedTitles.filter(at =>
                        Array.from(directoryLookUp).some(dir =>
                            levenshteinEditDistance(dir, at.normalized) <= 20 &&
                            similarity(dir, at.normalized) >= 0.7
                        )
                    );
                    if (fuzzyMatches.length >= 1) {
                        // Set additional properties for review
                        mangaupdatesTitleMatch = Enums.MANGAUPDATES_TITLE_MATCH.ASSOCIATED_TITLE_SIMILAR;

                        // Multiple fuzzy matches found, add all for review
                        const associatedTitlesMatches = fuzzyMatches.map(fuzzyMatch => {
                            const matchedDir = directories.find(dir =>
                                levenshteinEditDistance(Utils.normalizeText(dir.name), fuzzyMatch.normalized) <= 20 &&
                                similarity(Utils.normalizeText(dir.name), fuzzyMatch.normalized) >= 0.7
                            );
                            if (matchedDir)
                                return Manga.buildReviewItemObj({
                                    titleMatch: mangaupdatesTitleMatch,
                                    title: fuzzyMatch.title,
                                    normalized: fuzzyMatch.normalized,
                                    directory: matchedDir.name,
                                    key: matchedDir.key
                                });
                        });
                        if (associatedTitlesMatches) {
                            similarTitlesMatches.push(...associatedTitlesMatches.filter(function (item) { return item !== undefined; }));

                            pendingReviewMatch = true; // Multiple possible matches, needs review
                        }
                    } else {
                        if (!pendingReviewMatch) {
                            // No associated titles matched directoryLookUp
                            // Log message
                            console.log(Manga.createLogMessage(Manga.MangaReadingListTemplate, {
                                prefix: ''.concat('?'),
                                id: readingItem.record.series.id,
                                title: seriesTitle,
                                sufix: ' (No associated titles matched directoryLookUp)'
                            }));

                            // If we are here, we will save the serie for review
                            pendingReviewMatch = true;
                        }
                    }
                }
            }
        }

        // 4.5) Build a new series entry.
        //      Happens before step 5 so we can log if needed
        serieDetail = {
            key,
            id: readingItem.record.series.id,
            title: seriesTitle,
            url: readingItem.record.series.url,
            chapter: readingItem.record.status.chapter,
            volume: readingItem.record.status.volume,
            userRating: readingItem.metadata.user_rating,
            lastChapter: readingItem.metadata.series.latest_chapter,
            associatedTitles: pendingReviewMatch ? [] : associatedTitles.map(at => at.title), // If pendingReviewMatch is true, we will not save associated titles
            directory,
            alias,
            mangaupdatesTitleMatch,
            year: '',
            completed: false,
            type: '',
            status: ''
        };

        // Add additional fields from the MangaUpdates serie
        serieDetail = /** @type {mangaSerieDetail} */ (
            Utils.getAdditionalProperties(
                completeSerieDetailFields,
                serie,
                serieDetail
            )
        );

        // 5) a) If no match found or multiple possibilities were found (no directory could be matched).
        //    b) If matched by similarity, the match will be forced to review.
        //    Skip this serie
        if (!matchSuccesfull || pendingReviewMatch) {
            // Build a plain object from a single readingItem:
            const readingItemObj = readingItem;

            // Build possibleDirectories with
            // Matches found for similar & associated titles
            const possibleDirectoriesReview = similarTitlesMatches;

            // Add key to associatedTitles if they have a match in possibleDirectories
            /** @type {associatedTitleItem[]} */
            let associatedTitlesReview = [];

            if (similarTitlesMatches.length > 0) {
                const aT = associatedTitles.map(match => {
                    // If match.title is in associatedTitles, add key
                    const at = similarTitlesMatches.find(atm => atm.title === match.title);
                    return at ? { title: match.title, key: match.key } : { title: match.title };
                });

                associatedTitlesReview.push(...
                    aT.map(at => {
                        return { title: at.title, key: at?.key };
                    })
                );
            }

            // Unmatched entry for review (troubleshooting)
            serieReview = {
                id: readingItem.record.series.id,
                title: seriesTitle,
                normalizedTitle: normalizedSeriesTitle,
                associatedTitles: associatedTitlesReview, // Save associated titles for review
                possibleDirectories: possibleDirectoriesReview,
                matchedSerie: serieDetail,
                readingItem: readingItems.readingItem, // Save the original readingItem for review
                timestamp: new Date().toISOString()
            };

            status = Enums.GET_READINGLIST_SERIEDETAIL_STATUS.FOR_REVIEW;
        }

        return { status, serieDetail, serieReview };
    }

    /**
     * Create a formatted log message using a template string.
     *
     * @param {string} template - A string with placeholders like {id}, {title}, etc.
     * @template {{ [key: string]: unknown }} T
     * @param {T} values - Key-value pairs to replace in the template.
     * @returns {string}
     * @static
     */
    static createLogMessage = (template, values) =>
        template.replace(/\{(\w+)\}/g, (_, key) => values[key]?.toString() ?? 'N/A');

    /**
     * Processes a single Hakuneko entry to update its details.
     * @this {Manga}
     * @param {string} key - The key of the Hakuneko entry.
     * @param {HakunekoEntry} entry - The Hakuneko entry to process.
     * @param {mangaListDirectoryEntry[]} directories - The list of available directories.
     * @param {Record<string, mangaHakuneko>} existingEntries - The existing manga Hakuneko entries.
     * @returns {{ updatedEntry: mangaHakuneko|null, shouldRemove: boolean }} The updated entry, or null if it should be removed.
     * @private
     */
    _processMangaHakunekoEntry(key, entry, directories, existingEntries) {
        const slug = key;
        let updatedEntry = /** @type {mangaHakuneko} */ (entry);

        const seriesFields = ['id', 'title', 'url', 'chapter', 'volume', 'userRating', 'lastChapter', 'associatedTitles',
            'directory', 'alias', 'mangaupdatesTitleMatch', 'year', 'completed', 'type', 'status'];

        try {
            updatedEntry = /** @type {mangaHakuneko} */ (Utils.getAdditionalProperties(seriesFields, existingEntries, entry));
        } catch (error) {
            console.log(`(_processMangaHakunekoEntry) Working ${slug} when Error: ${error}`);
            return { updatedEntry: null, shouldRemove: false };
        }

        const fullPath = path.join(this.path, entry.hfolder);
        const foundDirectory = directories.find(dir => dir.key === slug);

        // If the directory exists, update the entry
        if (foundDirectory) {
            // Get the maximum chapter from the directory entry
            const max = foundDirectory.lastChapter;

            // If max is not null, update it
            if (max !== null) {
                updatedEntry.hlastchapter = max;
                updatedEntry.hlastModified = foundDirectory.mtime;
            }

            return { updatedEntry: updatedEntry, shouldRemove: false };
        } else {
            console.warn(`(_processMangaHakunekoEntry) Removing ${slug} due to missing ${fullPath}:`);
            return { updatedEntry: null, shouldRemove: true };
        }
    }

    /**
     * Builds a single Hakuneko manga entry from pre-loaded data. This is a pure function without I/O.
     * @param {string} key - The key of the manga series.
     * @param {MangaDBDefaults} mangaData - The pre-loaded data from the manga database.
     * @param {HakunekoDBDefaults} hakunekoData - The pre-loaded data from the Hakuneko database.
     * @returns {Promise<{
     *   key: string,
     *   finalEntry: mangaHakuneko|null,
     *   isMatching: boolean,
     *   id: number|null,
     *   shouldRemove: boolean
     * }|null>} A promise that resolves with the processing result.
     * @async
     */
    async buildMangaHakunekoForSerie(key, mangaData, hakunekoData) {
        if (!key) {
            console.error('Invalid key provided to buildMangaHakunekoForSerie');
            return null;
        }

        const directories = mangaData.directories;
        const existingEntries = mangaData.hakuneko || {};
        const hakunekoEntries = hakunekoData.hakuneko || Object.create(null);
        const mangalistReadingList = mangaData.readinglist;

        const hakunekoEntry = hakunekoEntries[key];
        if (!hakunekoEntry) {
            console.warn(`(buildMangaHakunekoForSerie) Hakuneko entry not found for key: ${key}`);
            return null;
        }

        const { updatedEntry: processedEntry, shouldRemove } = this._processMangaHakunekoEntry(key, hakunekoEntry, directories, existingEntries);

        if (shouldRemove) {
            return { key: key, finalEntry: null, isMatching: false, id: null, shouldRemove: true };
        }

        if (!processedEntry) {
            console.warn(`(buildMangaHakunekoForSerie) Failed to process Hakuneko entry for key: ${key}`);
            return null;
        }

        const hakuneko = { [key]: processedEntry };

        const merged = mangalistReadingList.filter(manga => hakuneko[manga.key])
            .map(manga => {
                /** @type {mangaHakuneko} */
                let serieDetail = /** @type {mangaHakuneko} */ (Manga.serieDetailObj(manga));
                const hakunekoFields = ['hkey', 'hmanga', 'hconnector', 'hconnectorDescription', 'hfolder',
                    'himageAvailable', 'hlastchapter', 'hchapter', 'hlastModified'];

                serieDetail = /** @type {mangaHakuneko} */ (Utils.getAdditionalProperties(hakunekoFields, hakuneko[manga.key], serieDetail));

                const hchapterEmpty = (serieDetail.hchapter === undefined || serieDetail.hchapter === null || serieDetail.hchapter === 0 || isNaN(serieDetail.hchapter));
                const chapterMatches = (hchapterEmpty && (serieDetail.chapter === 1)) || (Math.floor(serieDetail.hchapter) === Math.floor(serieDetail.chapter));

                if (!chapterMatches) {
                    serieDetail.chapter = (hchapterEmpty && serieDetail.chapter !== 1) ? 1 : Math.floor(serieDetail.hchapter);
                }
                return serieDetail;
            })
            .filter(Boolean);

        /**
         * Handles unmatched entries by creating a new mangaHakuneko object with default values.
         * @param {string} serieKey
         * @param {mangaHakuneko} serie
         * @returns {mangaHakuneko}
         */
        const unMatched = (serieKey, serie) => {
            const seriesFields = ['id', 'title', 'url', 'chapter', 'volume', 'userRating', 'lastChapter', 'associatedTitles',
                'directory', 'alias', 'mangaupdatesTitleMatch', 'year', 'completed', 'type', 'status'];
            let serieDetail = Manga.serieDetailObj({ key: serieKey });
            if (serie.directory !== "") {
                serieDetail = /** @type {mangaHakuneko} */ (Utils.getAdditionalProperties(seriesFields, serie, serieDetail));
            }
            return {
                ...serieDetail,
                hkey: serie.hkey,
                hconnector: serie.hconnector,
                hconnectorDescription: serie.hconnectorDescription,
                hchapter: serie.hchapter,
                hmanga: serie.hmanga,
                hfolder: serie.hfolder,
                himageAvailable: serie.himageAvailable,
                hlastchapter: serie.hlastchapter,
                hlastModified: serie.hlastModified
            };
        };

        const finalEntry = merged.length > 0 ? merged[0] : unMatched(key, processedEntry);

        if (!finalEntry || Object.keys(finalEntry).length === 0) {
            console.error(`(buildMangaHakunekoForSerie) Failed to build managaHakunekoEntry for key: ${key}`);
            return null;
        }

        return {
            key: key,
            finalEntry: finalEntry,
            isMatching: merged.length > 0,
            id: merged.length > 0 ? merged[0].id : null,
            shouldRemove: false
        };
    }

    /**
        * Builds the Hakuneko manga entries from the database by processing each series individually.
        * This version is optimized to load data once and process entries in parallel.
        * @this {Manga}
        * @returns {Promise<void>} A promise that resolves when all Hakuneko manga entries have been built.
        * @async
        */
    async buildMangaHakuneko() {
        if (!this.db || !this.hakuneko?.db) return;

        // 1. Load all data into memory once
        await this.db.read();
        await this.hakuneko.db.read();

        const mangaData = this.db.data;
        const hakunekoData = this.hakuneko.db.data;
        const hakunekoEntries = hakunekoData.hakuneko || {};

        const originalDbDataJson = JSON.stringify(mangaData);

        // 2. Process all entries in parallel
        const processingPromises = Object.keys(hakunekoEntries).map(key => {
            // Note: We are now passing the whole data objects to the pure function.
            return this.buildMangaHakunekoForSerie(key, mangaData, hakunekoData);
        });

        /**
         * @type {({ key: string, finalEntry: mangaHakuneko|null, isMatching: boolean, id: number | null, shouldRemove: boolean }|null)[]}
         */
        const results = (await Promise.all(processingPromises)).filter(Boolean);

        // 3. Prepare new data structures by rebuilding them from the results
        /** @type {MangaHakunekoList} */
        const newHakuneko = Object.create(null);

        /** @type {MangaHakunekoMatching[]} */
        const newMangahakunekomatching = [];

        /** @type {MangaHakunekoMatching[]} */
        const newMangahakunekonotmatching = [];

        const keysToRemoveFromReadingList = new Set();

        for (const result of results) {
            if (!result) continue;

            if (result.shouldRemove) {
                keysToRemoveFromReadingList.add(result.key);
                continue; // This entry will be excluded from the new hakuneko table
            }

            if (result.finalEntry) {
                // The numeric key is just an index, so we can safely regenerate it.
                const newNumericKey = Object.keys(newHakuneko).length.toString();
                newHakuneko[newNumericKey] = result.finalEntry;

                if (result.isMatching) {
                    if( result.id === null ) { // Sanity check, should not happen
                        console.error(`(buildMangaHakuneko) Missing ID for entry: ${result.key}`);
                        continue;
                    }
                    newMangahakunekomatching.push({ key: result.key, id: result.id });
                } else {
                    newMangahakunekonotmatching.push({ key: result.key });
                }
            }
        }

        // Replace the old tables with the newly built ones
        mangaData.hakuneko = newHakuneko;
        mangaData.mangahakunekomatching = newMangahakunekomatching;
        mangaData.mangahakunekonotmatching = newMangahakunekonotmatching;

        // Apply removals from reading list
        if (keysToRemoveFromReadingList.size > 0) {
            mangaData.readinglist = mangaData.readinglist.filter(entry => {
                if (keysToRemoveFromReadingList.has(entry.key)) {
                    console.log(`- ID: ${entry.id}, TITLE: ${entry.title} (Removing from reading list due to missing directory)`);
                    return false;
                }
                return true;
            });
        }

        // 4. Write to DB once if anything changed
        if (originalDbDataJson !== JSON.stringify(mangaData)) {
            await this.db.write();
            console.log('MangaHakuneko build complete. Database updated.');
        } else {
            console.log('MangaHakuneko build complete. No changes detected.');
        }
    }

    /**
     * Update MangaUpdates reading list with chapter updates from Hakuneko
     * This function will build a list of series that have chapter updates in Hakuneko
     * and update the MangaUpdates reading list accordingly.
     * @this {Manga}
     * @returns {Promise<void>} A promise that resolves when the updates are complete.
     * @async
     */
    async sendHakunekoChapterUpdatesToMangaUpdates() {
        // Dry function to build a series change object
        // The change object represents the Manga Updates reading list update object
        /**
         * @typedef {{
         *   seriesID: number,
         *   listID: number,
         *   newChapter: number
         * }} bls
         *
         * @typedef {[number?, object?]} SeriesUpdate
         */

        /** @param {bls} sd */
        const buildListSerie = (sd) => `{"series":{"id":${sd.seriesID}},"list_id": ${sd.listID},"status": {"chapter": ${sd.newChapter}}}`;

        let skipall = false; // Use for debugging. Forces logic to skip all remaining entries if set
        /** @type {SeriesUpdate[]} */
        let listsSeriesUpdates = [];
        let seriesChange;
        let counter = 0;

        // If hakuneko instance not available just return
        if (!this.db) return;

        /**
         * Get data from database
         */

        // Assign instance db to local variable
        const db = this.db;

        // Make sure it's up to date
        await db.read();

        // Get existing entries from the Managa hakuneko table
        // This holds an object of objects
        /** @type {Record<string, mangaHakuneko>} */
        const mangaHakuneko = db.data.hakuneko || {};

        // Build the Manga Updates reading list update object on a 100 series block basis
        Object.entries(mangaHakuneko).forEach(([key, value]) => {
            // If the series has a Manga Updates series ID, skip
            if (!value.id || skipall) return

            // Is hchapter empty?
            const hchapterEmpty = (value.hchapter === undefined || value.hchapter === null || value.hchapter === 0 || isNaN(value.hchapter));

            // When comparing hchapter with chapter, we need to ensure that the chapter is a integer (MagaUpdates does not support floating point chapters)
            const chapterMatches = (hchapterEmpty && (value.chapter === 1)) || (Math.floor(value.hchapter) === Math.floor(value.chapter));

            // Skip if matches
            if (chapterMatches) return;

            //prepare the update
            const seriesID = value.id;
            const serieTitle = value.title;

            // If hchapter is empty, and chapter is not 1, set chapter to 1
            if (hchapterEmpty && (value.chapter !== 1))
                value.chapter = 1;

            // Assign hakuneko chapter "hchapter" which has the chapter count from the series reader
            else
                value.chapter = Math.floor(value.hchapter); // ensure that the chapter is a integer (MagaUpdates does not support floating point chapters)

            // Create the series change object using the template
            seriesChange = buildListSerie({ seriesID: seriesID, listID: 0, newChapter: value.chapter });

            // Calculate the current block number
            const block = Math.floor(counter / 100);

            // Initialize the subarray if it doesn't exist
            if (!listsSeriesUpdates[block] || !Array.isArray(listsSeriesUpdates[block]))
                listsSeriesUpdates[block] = /** @type {SeriesUpdate} */ ([]);

            try {
                // Add the change to the list
                listsSeriesUpdates[block].push(JSON.parse(seriesChange));
                console.log(`Key: ${key}, Title: ${serieTitle}, Value: ${seriesChange}`);
            }
            catch (error) {
                console.log(`Key: ${key}, Title: ${serieTitle}, Value: ${seriesChange}`);
            }

            // Increment the counter
            counter++;

        });

        /** @type {MangaUpdatesClass} */
        let mangaUpdatesInstance = Object.create(null);

        if (!this.mangaupdates || !(this.mangaupdates instanceof MangaUpdates))
            return;

        mangaUpdatesInstance = this.mangaupdates;

        if (!listsSeriesUpdates.length || !skipall)
            return;

        let results = [];
        // Get detail from manga updates
        for (let i = 0; i < listsSeriesUpdates.length; i++) {
            let updatesResults = await mangaUpdatesInstance.updateListSeries(listsSeriesUpdates[i]);

            if (updatesResults) {

                results.push(updatesResults);
                db.write();

                const series = listsSeriesUpdates[i].length;

                console.log(`Updated ${series} series for block ${i + 1} of ${listsSeriesUpdates.length}.`);
            }
        }

        if (!mangaUpdatesInstance.redisclient)
            return;

        /** @typedef {import('redis').RedisClientType} RedisClientType */
        /** @type {RedisClientType} */
        const redisclient = mangaUpdatesInstance.redisclient;

        const logKey = "MangaUpdates::updateListSeries::".concat(new Date().toDateString());

        // Save log. If run multiple times in a day only the last log will be available
        mangaUpdatesInstance.setRedisJSONValue(logKey, results);

        // Set TTL (e.g., 60 seconds * 60 minutes * 24 hours)
        // Check if redis connection is open, if not, establish it
        if (!redisclient.isOpen)
            await redisclient.connect();

        // Expire in a day
        await redisclient.expire(logKey, (60 * 60 * 24));
    }

    async syncUserRating() {
        // If the Hakuneko instance is not available, return an empty array
        if (!this.db || !(this.db instanceof Low) || !this.mangalist || !(this.mangalist.db instanceof Low)) {
            return [];
        }

        // Assign instance db to local variable
        const db = this.db;

        // Make sure it's up to date
        await db.read();

        // Assign hakuneko instance database to local variable, reserving the use of db to for local class database
        const mangalistDB = this.mangalist.db;

        // Make sure it's up to date
        await mangalistDB.read();

        /** Manga reading list
         * @type {mangaReadingList[]} - Reference to [Manga] [readinglist] */
        const mangaReadingList = db.data.readinglist;

        /** Source "MangaUpdates" reading list
          * @type {mangaupdatesReadingList[]} - Reference to [MangaUpdates] [readinglist] */
        const mangaupdatesReadingList = mangalistDB.data.readinglist;

        let modified = false;

        for (const readingItem of mangaupdatesReadingList) {
            const seriesID = readingItem.record.series.id;
            const serieDetail = mangaReadingList.find(obj => obj.id == seriesID);

            if (!serieDetail) continue;

            // Guard against missing fields
            const newUserRating = readingItem.metadata?.user_rating;
            const newChapter = readingItem.record.status?.chapter;

            let updatedFields = [];

            // Update user rating if changed
            if (newUserRating && newUserRating !== serieDetail.userRating) {
                const oldUserRating = serieDetail.userRating;
                serieDetail.userRating = newUserRating;
                modified = true;
                updatedFields.push(`Rating: ${oldUserRating} → ${newUserRating}`);
            }

            // Update chapter if changed
            if (newChapter && newChapter !== serieDetail.chapter) {
                const oldChapter = serieDetail.chapter;
                serieDetail.chapter = newChapter;
                modified = true;
                updatedFields.push(`Chapter: ${oldChapter} → ${newChapter}`);
            }

            if (updatedFields.length) {
                console.log(
                    `*ID: ${serieDetail.id}, Title: ${serieDetail.alias || serieDetail.title}, ${updatedFields.join(', ')}`
                );
            }
        }

        if (modified) {
            await db.write();
            console.log('User ratings and chapters have been synchronized with MangaUpdates.');
        } else {
            console.log('No changes in user ratings or chapters.');
        }
    }

    /**
     * Helper function to create a search series template.
     * @param {string} serieTitle - The title of the series to search for.
     * @returns {Record<string, unknown>} - The search series template.
     * @static
     */
    static searchSerieTemplate = (serieTitle) => ({
        search: serieTitle,
        stype: "title",
        page: 1,
        perpage: 25,
        pending: false,
        include_rank_metadata: false,
        exclude_filtered_genres: false
    });

    /**
     * Helper function to create a list entry.
     * @param {number} serieID
     * @param {string} serieTitle
     * @returns {Record<string, unknown>}
     * @static
     */
    static listEntryTemplate = (serieID, serieTitle) => ({
        series: { id: serieID, title: serieTitle },
        list_id: 0
    });

    /**
     * Updates directories without MangaUpdates reading list
     * @returns {Promise<void>}
     * @async
     */
    async updateDirectoriesWithOutMangaUpdatesReadingList() {
        // If the Hakuneko instance is not available, return an empty array
        if (!this.db || !(this.db instanceof Low) || !this.mangalist || !(this.mangalist.db instanceof Low)) {
            return;
        }

        // Assign instance db to local variable
        const db = this.db;

        // Make sure it's up to date
        await db.read();

        // Assign hakuneko instance database to local variable, reserving the use of db to for local class database
        const mangalistDB = this.mangalist.db;

        // Make sure it's up to date
        await mangalistDB.read();

        /** Manga reading list
         * @type {MangaHakunekoMatching[]} - Reference to [Manga] [readinglist] */
        const mangaHakunekoMatchingList = db.data.mangahakunekomatching || [];

        /** Manga reading list
         * @type {MangaHakunekoMatching[]} - Reference to [Manga] [readinglist] */
        const mangaHakunekoNotMatchingList = db.data.mangahakunekonotmatching || [];

        /** Source "MangaUpdates" reading list
          * @type {mangaupdatesReadingList[]} - Reference to [MangaUpdates] [readinglist] */
        const mangaupdatesReadingList = mangalistDB.data.readinglist;
        const murlLookup = new Map(mangaupdatesReadingList.map(item => [item.record.series.id, item]));

        // Sort changes our { key: object, } --> [ [key, value], ]
        /**
         * An array of entries from the `db.data.hakuneko` object, sorted alphabetically by the `hmanga` property (case-insensitive).
         * Each entry is a tuple where the first element is the key (string) and the second element is the value (object with an optional `hmanga` property).
         *
         * @type {Array<[string, mangaHakuneko]>} - Sorted entries from the `db.data.hakuneko` object.
         */
        const sortedUnmatched = Object.entries(db.data.hakuneko).sort((a, b) => {
            const titleA = (a[1].hmanga || '').toLowerCase();
            const titleB = (b[1].hmanga || '').toLowerCase();
            return titleA.localeCompare(titleB);
        });

        /**
         * Create search series for unmatched manga
         * @type {Record<string, unknown>[]} - Array of search series
         */
        let searchSeries = [];
        sortedUnmatched.forEach(([_, value]) => {
            if (value.id !== null) return

            searchSeries.push(Manga.searchSerieTemplate(value.hmanga));
        });

        // If the MangaUpdates instance is not available, return
        if (!this.mangaupdates || !(this.mangaupdates instanceof MangaUpdates)) {
            return;
        }

        // Get the MangaUpdates instance
        const mangaUpdatesInstance = this.mangaupdates;

        // Initialize the hakuneko to manga updates list
        /**
         * List of manga series from Hakuneko that are available in MangaUpdates
         * @type {Array<{ id: number, title: string, availableSeries: MangaUpdatesSearchSeriesResultEntry[] }>}
         */
        const hakunekoToMangaUpdatesList = db.data.hakunekotomangaupdateslist || [];

        // Create a lookup set for quick access
        const htmulLookup = new Set(hakunekoToMangaUpdatesList.map(item => item.id));

        const batchSize = 5;
        for (let i = 0; i < searchSeries.length; i += batchSize) {
            const batch = searchSeries.slice(i, i + batchSize);
            const promises = batch.map(async (searchTitle) => {
                try {
                    /** @type {MangaUpdatesSearchSeriesResultEntry[]} */
                    const search = await mangaUpdatesInstance.serieSearch(searchTitle);

                    // Check if search returned any results
                    if (!search || Object.values(search).length === 0) return null;

                    // Get series where the hit_title matches the search title
                    const availableSeries = Object.values(search).filter(item => Utils.normalizeText(item.hit_title) === Utils.normalizeText(/** @type {string} */(searchTitle.search)));

                    // Skip if no serie was found
                    if (!availableSeries || availableSeries.length === 0) return null;

                    // Get the first found series. In theory, there should only be one that is an exact match
                    const foundSerie = availableSeries[0];

                    // If the series is already in the hakunekoToMangaUpdatesList, skip it
                    if (htmulLookup.has(foundSerie.record.series_id)) {
                        return null;
                    }

                    // Check if the series is already in the MangaUpdatesreading list
                    const idx = mangaupdatesReadingList.findIndex(rd => rd.record.series.id == foundSerie.record.series_id);

                    if (idx !== -1) return null;

                    return {
                        id: foundSerie.record.series_id,
                        title: foundSerie.record.title,
                        availableSeries: [], //availableSeries
                    };
                }
                catch (error) {
                    console.log(error);
                    return null;
                }
            });

            const results = await Promise.all(promises);
            /** @type {Array<({ id: number, title: string, availableSeries: MangaUpdatesSearchSeriesResultEntry[] }|null)>} */
            const newEntries = results.filter(Boolean);

            if (newEntries.length > 0) {
                for (const entry of newEntries) {
                    if (!entry) continue;

                    if (!htmulLookup.has(entry.id)) {
                        hakunekoToMangaUpdatesList.push(entry);
                        htmulLookup.add(entry.id);
                    }
                }
            }

            if (i + batchSize < searchSeries.length) {
                await Utils.wait(1000); // Wait 1 second between batches
            }
        }

        if (hakunekoToMangaUpdatesList.length > (db.data.hakunekotomangaupdateslist || []).length) {
             await db.write();
        }

        // Update the database with the hakuneko to manga updates list
        await this.addSerieToMangaUpdatesReadingList(hakunekoToMangaUpdatesList);

        await this.findReadingListDiscrepancies();

        return;
    }

    /**
     * Find discrepancies between the local reading list and the source MangaUpdates reading list.
     * @returns {Promise<void>}
     * @async
     */
    async findReadingListDiscrepancies() {
        // If the Hakuneko instance is not available, return an empty array
        if (!this.db || !(this.db instanceof Low) || !this.mangalist || !(this.mangalist.db instanceof Low)) {
            return;
        }

        // Assign instance db to local variable
        const db = this.db;

        // Make sure it's up to date
        await db.read();

        // Assign hakuneko instance database to local variable, reserving the use of db to for local class database
        const mangalistDB = this.mangalist.db;

        // Make sure it's up to date
        await mangalistDB.read();

        /** Manga reading list
         * @type {mangaReadingList[]} - Reference to [Manga] [readinglist] */
        const mangaReadingList = db.data.readinglist;

        /** Source "MangaUpdates" reading list
          * @type {mangaupdatesReadingList[]} - Reference to [MangaUpdates] [readinglist] */
        const mangaupdatesReadingList = mangalistDB.data.readinglist;

        const localListIDs = new Set(mangaReadingList.map(item => item.id));
        const sourceListIDs = new Set(mangaupdatesReadingList.map(item => item.record.series.id));

        const discrepancies = [];

        // Find series missing from local list
        for (const sourceItem of mangaupdatesReadingList) {
            if (!localListIDs.has(sourceItem.record.series.id)) {
                discrepancies.push({
                    type: 'missing_local',
                    id: sourceItem.record.series.id,
                    title: sourceItem.record.series.title,
                    data: sourceItem,
                });
            }
        }

        // Find series missing from source list
        for (const localItem of mangaReadingList) {
            if (!sourceListIDs.has(localItem.id)) {
                discrepancies.push({
                    type: 'missing_source',
                    id: localItem.id,
                    title: localItem.title,
                    data: localItem,
                });
            }
        }

        // Find series with mismatched data
        for (const localItem of mangaReadingList) {
            if (sourceListIDs.has(localItem.id)) {
                const sourceItem = mangaupdatesReadingList.find(item => item.record.series.id === localItem.id);
                if (sourceItem) {
                    const mismatchedFields = {};
                    if (localItem.chapter !== sourceItem.record.status.chapter) {
                        mismatchedFields.chapter = { local: localItem.chapter, source: sourceItem.record.status.chapter };
                    }
                    if (localItem.volume !== sourceItem.record.status.volume) {
                        mismatchedFields.volume = { local: localItem.volume, source: sourceItem.record.status.volume };
                    }
                    if (localItem.userRating !== sourceItem.metadata.user_rating) {
                        mismatchedFields.userRating = { local: localItem.userRating, source: sourceItem.metadata.user_rating };
                    }
                    if (Object.keys(mismatchedFields).length > 0) {
                        discrepancies.push({
                            type: 'mismatch',
                            id: localItem.id,
                            title: localItem.title,
                            data: mismatchedFields,
                        });
                    }
                }
            }
        }

        db.data.readinglistdiscrepancies = discrepancies;
        await db.write();

        if (discrepancies.length > 0) {
            console.log(`Found ${discrepancies.length} discrepancies in the reading list.`);
        } else {
            console.log('No discrepancies found in the reading list.');
        }
    }

    /**
     * Adds series from the Hakuneko reading list to the MangaUpdates reading list.
     * @param {Array<{ id: number, title: string, availableSeries: MangaUpdatesSearchSeriesResultEntry[] }>} hakunekoToMangaUpdatesList
     * @returns {Promise<void>}
     * @async
     */
    async addSerieToMangaUpdatesReadingList(hakunekoToMangaUpdatesList) {
        // If the MangaUpdates instance is not available, return
        if (!this.mangaupdates || !(this.mangaupdates instanceof MangaUpdates)) {
            return;
        }

        // Get the MangaUpdates instance
        const mangaUpdatesInstance = this.mangaupdates;

        // If the Hakuneko instance is not available, return an empty array
        if (!this.db || !(this.db instanceof Low) || !this.mangalist || !(this.mangalist.db instanceof Low)) {
            return;
        }

        // Assign instance db to local variable
        const db = this.db;

        // Make sure it's up to date
        await db.read();

        // Assign hakuneko instance database to local variable, reserving the use of db to for local class database
        const mangalistDB = this.mangalist.db;

        // Make sure it's up to date
        await mangalistDB.read();

        /** Source "MangaUpdates" reading list
          * @type {mangaupdatesReadingList[]} - Reference to [MangaUpdates] [readinglist] */
        const mangaupdatesReadingList = mangalistDB.data.readinglist;
        const murlLookup = new Map(mangaupdatesReadingList.map(item => [item.record.series.id, item]));

        if (hakunekoToMangaUpdatesList.length) {
            let processed = false;
            // Batch process hakunekoToMangaUpdatesList in chunks of 25
            const batchSize = 25;
            for (let i = 0; i < hakunekoToMangaUpdatesList.length; i += batchSize) {
                // Take the first 25 records
                /** @type {Array<{ id: number, title: string, availableSeries: MangaUpdatesSearchSeriesResultEntry[] }>} */
                const batch = hakunekoToMangaUpdatesList.slice(i, i + batchSize);

                // Prepare the payload for addListSeries
                const payload = batch
                    .filter(item => {
                        if (!item.id || !item.title) {
                            console.warn(`Skipping item with missing id or title: ${JSON.stringify(item)}`);
                            return false;
                        }
                        return !murlLookup.has(item.id);
                    })
                    .filter(Boolean) // Filter out any falsy values
                    .map(item => {
                        let serieTemplate = Object.create(null);
                        try {
                            serieTemplate = Manga.listEntryTemplate(item.id, item.title);
                        } catch (error) {
                            console.error('Error creating series template:', error);
                        }
                        return serieTemplate;
                    })
                    .filter(Boolean);

                // If no valid payload, skip the batch
                if (payload.length === 0) {
                    continue;
                }

                // Call the function (replace with your actual function)
                try {
                    // Replace with the actual function call and payload as needed
                    /** @type {import('axios').AxiosResponse} */
                    const result = /** @type {import('axios').AxiosResponse} */ (await mangaUpdatesInstance.addListSeries(payload));
                    if (result.status === 200) {
                        console.log(`Added ${payload.length} series to MangaUpdates reading list.`);
                        console.log(result.data);
                        processed = true;
                        // Add the new series to the lookup map to avoid duplicates in the next batch
                        payload.forEach(item => murlLookup.set(item.series.id, item));
                    }
                } catch (err) {
                    console.error('Error adding batch to MangaUpdates:', err);
                    break; // If a batch fails, stop processing to avoid further errors
                }

                // Optional: wait between batches to avoid rate limits
                if (i + batchSize < hakunekoToMangaUpdatesList.length) {
                    await Utils.wait(2000);
                }
            }

            if(processed) {
                // Filter out the series that have been successfully added
                db.data.hakunekotomangaupdateslist = db.data.hakunekotomangaupdateslist.filter(item => !murlLookup.has(item.id));
                await db.write();
            }
        }

        return;
    }

    /**
     * Get the image data URL for a manga image.
     * @param {string} mangaImage - The filename of the manga image.
     * @returns {Promise<string|null>} - The data URL of the image or null if not found.
     */
    async getMangaImage(mangaImage) {
        const imgFile = path.join(this.settings.mangalist.images.directoryPathName, mangaImage);

        try {
            const data = await fs.readFile(imgFile);
            const ext = path.extname(imgFile).substring(1).toLowerCase();

            // Default to jpg if extension is missing or not recognized
            const mimeType = ['jpg', 'jpeg', 'png', 'gif'].includes(ext) ? ext : 'jpg';

            return `data:image/${mimeType};base64,${data.toString('base64')}`;
        } catch (error) {
            console.error(`Failed to read image file at ${imgFile}:`, error);
            return null;
        }
    }

    /**
     * Searches for a MangaUpdates series by name.
     * @param {string} seriesTitle - The title of the series to search for.
     * @param {boolean} [useCache=true] - Whether to use cached data if available.
     * @returns {Promise<MangaUpdatesSearchSeriesResultEntry[]>} - The search results or null if an error occurred.
     * @async
     */
    async searchMangaUpdatesSerieByName(seriesTitle, useCache = true) {
        if (!seriesTitle) {
            return [];
        }

        if (!this.mangaupdates || !(this.mangaupdates instanceof MangaUpdates)) {
            return [];
        }
        const mangaUpdatesInstance = this.mangaupdates;

        try {
            // Create a search template for the series title
            /** @type {Record<string, unknown>} */
            const searchTitle = Manga.searchSerieTemplate(seriesTitle);

            // Refresh the manga updates instance if not using cache
            if (!useCache) {
                mangaUpdatesInstance.refresh(true);
            }

            /** @type {MangaUpdatesSearchSeriesResultEntry[]} */
            const search = await mangaUpdatesInstance.serieSearch(searchTitle);

            // Check if search returned any results
            if (!search || Object.values(search).length === 0) return [];

            return search;
        } catch (error) {
            console.error('Error searching MangaUpdates series by name:', error);
            return [];
        }
    }

    /**
     * Searches for a MangaUpdates series by ID.
     * @param {number} seriesID
     * @param {boolean} [useCache=true] - Whether to use cached data if available.
     * @returns {Promise<MangaUpdatesSeriesResultEntry>} - The search results or empty object if an error occurred.
     * @async
     */
    async searchMangaUpdatesSerieByID(seriesID, useCache = true) {
        if (!seriesID) {
            return Object.create(null);
        }

        if (!this.mangaupdates || !(this.mangaupdates instanceof MangaUpdates)) {
            return Object.create(null);
        }
        const mangaUpdatesInstance = this.mangaupdates;

        try {
            // Refresh the manga updates instance if not using cache
            if (!useCache) {
                mangaUpdatesInstance.refresh(true);
            }

            /** @type {MangaUpdatesSeriesResultEntry} */
            const search = await mangaUpdatesInstance.getSerieDetail(seriesID);

            // Check if search returned any results
            if (!search || Object.values(search).length === 0) return Object.create(null);

            return search;
        } catch (error) {
            console.error('Error searching MangaUpdates series by ID:', error);
            return Object.create(null);
        }
    }

    /**
     * Get the Manga Hakuneko list
     * @returns {Promise<MangaHakunekoList>}
     * @async
     */
    async getHakunekoReadingList() {
        // If the Hakuneko instance is not available, return an empty array
        if (!this.db || !(this.db instanceof Low)) {
            return Object.create(null);
        }

        // Assign instance db to local variable
        const db = this.db;

        // Make sure it's up to date
        await db.read();

        /**
         * Get the Manga review list
         *
         * @type {MangaHakunekoList} - Reference to [Manga] [unmatchedfromreadinglist] */
        const mangaHakunekoList = db.data.hakuneko || Object.create(null);

        // Return the Manga HakunekoF list
        return mangaHakunekoList;
    }

    /**
     * Re-build the MangaUpdates Reading List
     * The Reading List is user controlled, so user can decide to update, when he changes it
     *
     * The data dependency flow is:
     *      (top) MangaUpdates Reading List (bottom)
     *
     * The interface for a single entry is:
     *      MangaUpdatesReadingListSearchResultsEntry
     *
     *  @returns {Promise<boolean>}
     * @async
     */
    async reloadMangaUpdatesReadingList() {
        // Is a Manga List instance available
        if (!this.mangalist || !(this.mangalist instanceof MangaList)) {
            throw new Error('(reloadMangaUpdatesList) Aborting request. Manga List instance not available.')
        }

        // Force MangaUpdates API wrapper to ignore the cached data and re-get from MangaUpdates
        // This data is cached to avoid hitting the server excessively
        //
        const ignoreCache = true;

        // Load manga reading list
        try {
            // If the MangaList instance is not available, return false
            if (!this.mangalist || !(this.mangalist instanceof MangaList)) {
                return false;
            }

            // Update the MangaUpdates reading list cache
            await this.mangalist.getReadingList(ignoreCache);
        } catch (error) {
            if (error instanceof Error) {
                throw new Error('(reloadMangaUpdatesList) Aborting request. Error occured while load the list.'.concat(error.message))
            } else {
                throw new Error('(reloadMangaUpdatesList) Aborting request. Error occured while load the list.'.concat(String(error).toString()))
            }
        }

        return true;
    }

    /**
     * Re-build the Manga Reading List
     * The data dependency flow is:
     *      (top) Manga Reading List <-- MangaUpdates Reading List (bottom)
     * @returns {Promise<boolean>}
     * @async
     */
    async reloadMangaReadingList() {
        try {
            // 1 - Make sure directories are up-to-date before proceeding
            await this.updateDirectories([]);

            // 2 - Process all pending series
            // Pending series are those found in MangaUpdates ReadingList but have yet to be added to Manga ReadingList
            await this.addNewSeries();
        } catch (error) {
            if (error instanceof Error) {
                throw new Error('(reloadMangaList) Aborting request. Error occured while adding series.'.concat(error.message))
            } else {
                throw new Error('(reloadMangaList) Aborting request. Error occured while adding series.'.concat(String(error).toString()))
            }
        }

        return true;
    }

    /**
     * Re-build the Hakuneko List
     * The data dependency flow is:
     *      (top) Hakuneko List <-- Manga Reading List <-- MangaUpdates Reading List (bottom)
     * @returns {Promise<boolean>}
     * @async
     */
    async reloadHakunekoList() {
        try {
            // If the Hakuneko instance is not available, return false
            if (!this.hakuneko || !(this.hakuneko instanceof Hakuneko)) {
                return false;
            }

            // 1 - Rebuild image keys
            await this.hakuneko.rebuildHakunekoImages();

            // 2 - Rebuild Hakuneko summary
            await this.hakuneko.rebuildHakuneko();

            // 3 - Make sure directories are up-to-date before proceeding
            await this.updateDirectories([]);

            // 4 - Build Manga Hakuneko List and update the database
            await this.buildMangaHakuneko();

            // 5 - Update MangaUpdates reading list with Hakuneko chapter updates
            await this.sendHakunekoChapterUpdatesToMangaUpdates();

            // 6 - Update directories without MangaUpdates reading list
            await this.updateDirectoriesWithOutMangaUpdatesReadingList();
        } catch (error) {
            if (error instanceof Error) {
                throw new Error('(reloadMangaUpdatesList) Aborting request. Error occured while load the list.'.concat(error.message))
            } else {
                throw new Error('(reloadMangaUpdatesList) Aborting request. Error occured while load the list.'.concat(String(error).toString()))
            }
        }

        return true;
    }

    /**
     * Sync series with MangaUpdates list entries
     * @returns {Promise<boolean>}
     * @async
     */
    async syncReadingList() {
        try {
            // If the Hakuneko instance is not available, return false
            if (!this.mangalist || !(this.mangalist instanceof MangaList)) {
                return false;
            }

            // Update the reading list in the database
            await this.syncUserRating();
        } catch (error) {
            if (error instanceof Error) {
                throw new Error('(reloadMangaUpdatesList) Aborting request. Error occured while load the list.'.concat(error.message))
            } else {
                throw new Error('(reloadMangaUpdatesList) Aborting request. Error occured while load the list.'.concat(String(error).toString()))
            }
        }

        return true;
    }

    /**
     * Get the review list for Manga
     * @this {Manga}
     * @returns {Promise<mangaSerieReviewitemObj[]>}
     * @async
     */
    async getUnmatchedFromReadingList() {
        // If the Hakuneko instance is not available, return an empty array
        if (!this.db || !(this.db instanceof Low)) {
            return [];
        }

        // Assign instance db to local variable
        const db = this.db;

        // Make sure it's up to date
        await db.read();

        /**
         * Get the Manga review list
         *
         * @type {mangaSerieReviewitemObj[]} - Reference to [Manga] [unmatchedfromreadinglist] */
        const mangaReviewList = db.data.unmatchedfromreadinglist || [];

        // Return the Manga review list
        return mangaReviewList
    }

    /**
     * Resolve reading list items in review
     * The selectedEntry is the option chosen by the user from the review list resolve or serie resolve action(s)
     *
     * This function differs from the addNewSeries function, as we need to handle the case where the entry is not found in:
     * - the MangaUpdates reading list [MangaList] [readinglist]
     *
     * Also note that we do not refresh the MangaUpdates reading list here, as the user may be in the process of resolving multiple entries
     * And we need to be moderate in our requests to MangaUpdates to avoid hitting their rate limits, especially pulling the entire reading list again
     * That is why we use the cached data, and only refresh it when the user explicitly requests it
     *
     * This function is used in two scenarios:
     * 1. The user is resolving an unmatched entry from the review list
     * 2. The user is resolving a series that is not found in [Manga] [readinglist] but is found in [Manga] [hakuneko]
     * In both cases, we need to:
     * - Add the series to the MangaUpdates reading list if not already present
     * - Add the series to the Manga reading list
     * - Remove the entry from the review list
     *
     * Note: The series ID is used as the unique identifier to reference series in MangaUpdates series
     *       And the directory key is used as the unique identifier for all local data
     *
     * Some of the data dependency flows are:
     *   (top) [Manga] Manga reading list <--- [MangaList] MangaUpdates reading list (aggregates directories with series context)
     *                                     ^   (the series ID is used as the unique identifier for MangaUpdates series)
     *                                     |
     *                                     |-- [Manga] Manga directories (bottom)
     *                                         (provides the series existence and naming context, also the last chapter available)
     *                                         (the key is unique, and used across all database except for MangaList, and is a "slug" of the directory name)
     *
     *   (top) [Manga] [hakuneko] <--- [Manga] Manga reading list <--- [MangaList] MangaUpdates reading list (bottom)
     *                             ^
     *                             |-- [Hakuneko] Registry of Manga being followed
     *                             |   (Keeps track of what chapter is currently being viewed and if there is an image present for the series)
     *                             |   (The series image is stored locally, and the name is the key with a .jpg extension)
     *                             |
     *                             |-- [Manga] Manga directories (bottom)
     *
     * @this {Manga}
     * @param {number} id
     * @param {mangaReviewItemObj} selectedEntry
     * @returns {Promise<boolean>}
     * @async
     */
    async resolveUnmatchedEntry(id, selectedEntry) {
        // ➽ 0 - Make sure passed parameters are present and base data is up-to-date before proceeding

        // ➤ 0.0 - Validate ID
        if (!id || isNaN(id) || id === 0) {
            console.error('Invalid ID provided for resolving unmatched entry.');
            return false;
        }
        // ➤ 0.1 - Validate selectedEntry
        if (!selectedEntry || typeof selectedEntry !== 'object' || !selectedEntry.key || !selectedEntry.title) {
            console.error('Invalid selected entry provided for resolving unmatched entry.');
            return false;
        }

        // ➤ 0.2 - To catch any new directories that may have been added since the last update
        //await this.updateDirectories([]);

        // ➤ 0.3 - Check for MangaUpdates instance availability

        // ➤➤ 0.3.0 - If the MangaUpdates instance is not available, notify renderer process that it could not be resolved
        if (!this.mangaupdates || !(this.mangaupdates instanceof MangaUpdates)) {
            console.error('MangaUpdates instance is not available');
            return false;
        }

        // ➤➤ 0.3.1 - Get the MangaUpdates instance
        /** @type {MangaUpdatesClass} - Reference to MangaUpdates instance. */
        const mangaUpdatesInstance = this.mangaupdates;


        // ➽ 1 - Prepare access to databases needed for processing
        // We need access to both the Manga database and the MangaList database
        // - The Manga database is used to update the reading list and remove the entry from the review list
        // - The MangaList database is used to get the reading list and check if the entry is already present
        //   and to add it if not

        // ➤ 1.0 - If the Hakuneko instance is not available, return an empty array
        if (!this.db || !(this.db instanceof Low) || !this.mangalist?.db || !(this.mangalist.db instanceof Low)) {
            return false;
        }

        // ➤ 1.1 - Assign instance db to local variable

        // ➤➤ 1.1.0 - The use of db is reserved for read-only operation for the local class database
        /** @type {Low<MangaDBDefaults>} - Reference to [Manga] database. */
        const db = this.db;

        // ➤➤ 1.1.1 - Make sure it's up to date
        await db.read();

        // ➤➤ 1.1.2 - Get Manga directories from the database
        /** @type {mangaListDirectoryEntry[]} - Reference to [Manga] [directories]. */
        const directories = db.data.directories;

        // ➤➤ 1.1.3 - Get Manga reading list from the database
        /** @type {mangaReadingList[]} - Reference to [Manga] [readinglist]. */
        const mangaReadingList = db.data.readinglist ?? [];

        // ➤➤ 1.1.4 - Get Manga hakuneko list from the database
        /** @type {mangaSerieReviewitemObj[]} - Reference to [Manga] [unmatchedfromreadinglist]. */
        const mangaReviewList = db.data.unmatchedfromreadinglist ?? [];

        // ➤ 1.2 - Assign mangalist instance database to local variable

        // ➤➤ 1.2.0 - The use of mangalistDB is reserved for read-only operation for the MangaList instance database
        /** @type {Low<MangaListDBDefaults>} - Reference to [Manga]->[MangaList] database. */
        const mangalistDB = this.mangalist.db;

        // ➤➤ 1.2.1 - Make sure it's up to date
        await mangalistDB.read();

        // ➤➤ 1.2.2 - Get MangaList reading list from the database
        /** @type {mangaupdatesReadingList[]} - Reference to [MangaList] [readinglist]. */
        const mangalistReadingList = mangalistDB.data.readinglist ?? [];

        // ➤ 1.3 - Validate that the reading list is available

        // ➤➤ 1.3.0 - Initialize reading item entry
        /** @type {mangaupdatesReadingList} - Reference to [Manga] [readinglist] database */
        let readingItemEntry = Object.create(null);


        // ➽ 2 - Use the provided ID and selectedEntry to get a readingItemEntry for adding the new serie to [Manga] [readinglist]
        // There are two scenarios here:
        //
        // 1. The serie ID is already in the MangaUpdates reading list [MangaList] [readinglist]
        // In this case, we use it to assign the readingItemEntry directly from the MangaUpdates reading list
        //
        // 2. The serie ID is not in the MangaUpdates reading list [MangaList] [readinglist]
        // In this case, we need to add it to the MangaUpdates reading list first
        // Then we can use it to assign the readingItemEntry

        // ➤ 2.0 - Validate that the reading list is available
        if (!mangalistReadingList || !Array.isArray(mangalistReadingList)) {
            console.error('MangaList reading list is not available');
            return false;
        }

        // ➤ 2.1 - Before we start, we need to check if the serie ID is already registered in [Manga] [readinglist]
        // If it is, there is most likely a duplicate serie with the same ID
        // What we need to do is log a warning and abort the operation
        // The user can then decide to remove the duplicate entry from the reading list
        // and re-add the entry from the review list

        // ➤➤ 2.1.0 - Get the entry index from [mangaDB.data.readinglist] table by ID
        const idxMRL = mangaReadingList.findIndex(entry => entry.id === id);

        // ➤➤ 2.1.1 - If the entry is found in the Manga reading list, log a warning and abort the operation
        if (idxMRL !== -1) {
            // ➤➤➤ 2.1.1.0 - Build a string with the details of the duplicate entries
            const duplicateEntry = mangaReadingList[idxMRL];
            const duplicateDetails = `ID: ${duplicateEntry.id}, Title: ${duplicateEntry.title}, Directory: ${duplicateEntry.directory || 'N/A'}`;

            // ➤➤➤ 2.1.1.1 - Log a warning with the duplicate entry details
            console.warn(`Manga series with ID: ${id} is already in the reading list`);
            console.warn(`Duplicate entry details: ${duplicateDetails}`);

            // ➤➤➤ 2.1.1.2 - Notify renderer process that it could not be resolved
            return true;
        }

        // ➤ 2.2 - Now we can check if the serie ID is in the MangaUpdates reading list

        // ➤➤ 2.2.0 - Get the entry index from [mangalistDB.data.readinglist] table by ID
        const idxMURL = mangalistReadingList.findIndex(entry => entry.record.series.id === id);

        // ➤➤ 2.2.1 - If the entry is not found in the MangaUpdates reading list, we need to add it
        if (idxMURL === -1) {
            // ➤➤➤ 2.2.1.0 - Get the series detail from MangaUpdates by ID
            /** @type {MangaUpdatesSeriesResultEntry} */
            const seriesEntry = await mangaUpdatesInstance.getSerieDetail(id);

            // ➤➤➤ 2.2.1.1 - If the entry was not found, notify renderer process that it could not be resolved
            if (!seriesEntry || Object.keys(seriesEntry).length === 0) {
                console.warn(`Could not find the MangaUpdates series detail for ID: ${id}`);
                return false;
            }

            // ➤➤➤ 2.2.1.2 - Create a new reading list entry
            const readingListTempEntry = {
                record: {
                    series: {
                        id: seriesEntry.series_id,
                        url: seriesEntry.url,
                        title: seriesEntry.title
                    },
                    list_id: 0, // Default list ID
                    status: {
                        chapter: 1,
                        volume: 1
                    }
                },
                metadata: {
                    series: {
                        latest_chapter: 1
                    },
                    user_rating: 0
                }
            }

            // ➤➤➤ 2.2.1.3 - Cast to mangaupdatesReadingList type
            readingItemEntry = /** @type {mangaupdatesReadingList} */ (readingListTempEntry);

            // ➤➤➤ 2.2.1.4 - Validate that the reading list is available
            if (!mangalistDB.data.readinglist || !Array.isArray(mangalistDB.data.readinglist)) {
                console.error('MangaList reading list is not available');
                return false;
            }

            /**
             *  ➤➤➤ 2.2.1.5 - Add the temporary reading item entry to the MangaList reading list
             * This ensures that the entry is available for further processing
             * It will be removed from the review list once the reading list is refreshed from MangaUpdates
             */
            mangalistDB.data.readinglist.push(readingItemEntry);

            // ➤➤➤ 2.2.1.6 - Write changes to the database
            await mangalistDB.write();

            // ➤➤➤ 2.2.1.7 - Get existing hakuneko to manga updates list entries
            // Initialize the hakuneko to manga updates list
            /** @type {Array<{ id: number, title: string, availableSeries: MangaUpdatesSearchSeriesResultEntry[] }>} */
            const hakunekoToMangaUpdatesList = db.data.hakunekotomangaupdateslist || [];

            // ➤➤➤ 2.2.1.8 - Add the un resolved entry to the hakuneko to local manga updates reading list
            if (hakunekoToMangaUpdatesList && Array.isArray(hakunekoToMangaUpdatesList)) {
                // ➤➤➤➤ 2.2.1.8.0 - Add entry to the update list for the API call
                hakunekoToMangaUpdatesList.push({
                    id: seriesEntry.series_id,
                    title: seriesEntry.title,
                    availableSeries: [], // Not needed here
                });

                // ➤➤➤➤ 2.2.1.8.1 - Write changes to the database
                await db.write();

                // ➤➤➤➤ 2.2.1.8.2 - Add series to the MangaUpdates reading list
                await this.addSerieToMangaUpdatesReadingList(hakunekoToMangaUpdatesList);
            }
            // ➤➤➤ 2.2.1.9 - If the hakuneko to manga updates list is not available, notify renderer process that it could not be resolved
            else {
                console.error('Hakuneko to MangaUpdates list was not available during record creation');
                return false;
            }
        }
        // ➤ ➤➤ 2.2.1 - If the entry was found in the MangaUpdates reading list, use it to assign the readingItemEntry
        else {
            // ➤➤➤ 2.2.1.0 - Get the entry index from [unmatchedfromreadinglist] table by ID
            readingItemEntry = mangalistReadingList[idxMURL];
        }

        // ➤ 2.3 - If a reading item entry was not found, notify renderer process that it could not be resolved
        if (!readingItemEntry || Object.keys(readingItemEntry).length === 0) {
            console.warn(`Could not find or create the MangaUpdates reading list entry for ID: ${id}`);
            return false;
        }

        // ➽ 3 - Now we have all the data we need to proceed with adding the new serie to [Manga] [readinglist]
        // We have:
        // - The ID of the serie to add
        // - The selected entry with the directory to use
        // - The reading item entry from the MangaUpdates reading list

        // ➤ 3.0 - Build the reading items object to pass to getReadingListSerieDetail function
        // This object contains all the data needed to add the new serie to the reading list
        /** @type {mangaReadingItems} */
        const readingItems = {
            readingItem: readingItemEntry, // Reading list item from MangaUpdates reading list
            reviewItem: selectedEntry, // Selected option for serie in review
            directories: directories, // Manga directories
            readingList: mangaReadingList, // List of series
            reviewList: mangaReviewList // List of series in review
        };

        // ➤➤ 3.1 - Add serie to mangaupdatesreadinglist with chosenDirectory
        const { status, serieDetail } = await this.getReadingListSerieDetail(readingItems);

        // ➤➤ 3.2 - If successful, add the series to the database
        if (status === Enums.GET_READINGLIST_SERIEDETAIL_STATUS.SUCCESS && (serieDetail && Object.keys(serieDetail).length !== 0)) {
            // ➤➤➤ 3.2.0 - Add the serie to the [Manga] database [readinglist] table
            this.db.data.readinglist.push(serieDetail);

            // ➤➤➤ 3.2.1 - Ensure all changes are written to the database
            await this.db.write();

            // ➤➤➤ 3.2.2 - Remove reading list entry from [unmatchedfromreadinglist] table
            // Get the entry index from unmatchedfromreadinglist by ID
            // If it was added to the reading list successfully, remove it from the review list, if it exists
            if (mangaReadingList.find(obj => obj.id === id)) {
                // ➤➤➤➤ 3.2.2.0 - Get the entry index from unmatchedfromreadinglist by ID
                const idx = mangaReviewList.findIndex(entry => entry.id === id);

                // ➤➤➤➤ 3.2.2.1 - If it was found, remove it from the review list
                if (idx !== -1) {
                    // ➤➤➤➤ 3.2.2.1.0 - Remove entry from unmatchedfromreadinglist
                    this.db.data.unmatchedfromreadinglist.splice(idx, 1);

                    // ➤➤➤➤ 3.2.2.1.1 - Remove entry from unmatchedfromreadinglist
                    await this.db.write();
                }
            }

            // ➤➤➤ 3.2.3 - Create or update the entry in [Manga] [hakuneko] the mangaHakuneko list
            // This ensures the series are updated in the UI and tracked for Hakuneko chapter updates
            await this.buildMangaHakuneko();

            // ➤➤➤ 3.2.4 - Log message
            console.log(Manga.createLogMessage(Manga.MangaReadingListTemplate, {
                prefix: ''.concat('+', serieDetail.mangaupdatesTitleMatch, ' '),
                id: serieDetail.id,
                title: serieDetail.title,
                alias: serieDetail.alias,
                directory: serieDetail.directory,
                sufix: ' (Added to Manga Reading List)'
            }));

            // ➤➤➤ 3.2.5 - Successfully added the series to the reading list
            return true;
        }
        // ➤➤ 3.3 - If not successful, log an error
        else {
            console.error(`Failed to add the series with ID: ${id} to the Manga reading list`);
        }

        // ➤ 3.4 - If we reach here, something went wrong, so we return false
        return false;
    }

    /**
     * Remove item in review from the review list
     * @param {number} id
     * @returns {Promise<boolean>}
     * @async
    */
    async removeUnmatchedEntry(id) {
        // If the Hakuneko instance is not available, return an empty array
        if (!this.db || !(this.db instanceof Low)) {
            return false;
        }

        // Assign instance db to local variable
        const db = this.db;

        // Make sure it's up to date
        await db.read();

        /** Manga review list
        * @type {mangaSerieReviewitemObj[]} - Reference to [Manga] [unmatchedfromreadinglist] */
        const mangaReviewList = db.data.unmatchedfromreadinglist;

        // Get the entry index from unmatchedfromreadinglist by ID
        const idx = mangaReviewList.findIndex(entry => entry.id === id);
        if (idx !== -1) {
            // Get the entry from unmatchedfromreadinglist
            const entry = mangaReviewList[idx];

            // Log message
            console.log(Manga.createLogMessage(Manga.MangaReadingListTemplate, {
                prefix: ''.concat('- '),
                id: entry.id,
                title: entry.title,
                sufix: ' (Removed from Manga Review List)'
            }));

            // Remove entry from unmatchedfromreadinglist
            mangaReviewList.splice(idx, 1);

            // Ensure all changes are written to the database
            await db.write();

            return true;

        }

        return false;
    }

    /**
     * Update the manga chapter in all data sources.
     * @param {string} key - The key of the manga to update.
     * @param {number} newChapter - The new chapter number.
     * @returns {Promise<void>}
     * @async
     */
    async updateMangaChapter(key, newChapter) {
        if (!key || !newChapter) {
            console.error('Invalid parameters provided to updateMangaChapter function.');
            return;
        }

        // If hakuneko instance not available just return
        if (!this.db || !this.hakuneko?.db) return;

        // 1. Get manga data from manga.json to find hkey and hconnector.
        await this.db.read();
        const mangaData = this.db.data.hakuneko;
        const mangaEntry = mangaData ? Object.values(mangaData).find(m => m.key === key) : undefined;

        if (!mangaEntry) {
            console.error(`Manga with key ${key} not found in manga.json.`);
            return;
        }

        const { hkey, hconnector } = mangaEntry;
        const newChapterID = `Chapter ${newChapter}.cbz`;

        // 2. Update hakuneko.chaptermarks file.
        const chaptermarksPath = this.settings.hakuneko.paths.chaptermarks;
        try {
            const chaptermarksData = await Hakuneko.getHakunekoChaptermarks(chaptermarksPath) || [];
            let chaptermarkEntry = chaptermarksData.find(cm => cm.mangaID === hkey && cm.connectorID === hconnector);

            if (chaptermarkEntry) {
                chaptermarkEntry.chapterID = newChapterID;
                chaptermarkEntry.chapterTitle = newChapterID;
            } else {
                chaptermarksData.push({
                    connectorID: hconnector,
                    mangaID: hkey,
                    chapterID: newChapterID,
                    chapterTitle: newChapterID
                });
            }
            await fs.writeFile(chaptermarksPath, JSON.stringify(chaptermarksData, null, 2));
        } catch (error) {
            console.error(`Failed to update ${chaptermarksPath}:`, error);
        }

        // 3. Update hakuneko.json.
        try {
            await this.hakuneko.db.read();
            /**
             * @type {{ chaptermarks: ChapterMark[], hakuneko: Record<string, { hchapter?: number }> }} - Reference to [Hakuneko] [db] database
             */
            const { chaptermarks, hakuneko } = this.hakuneko.db.data;

            // 3.1 Update chaptermarks table.
            /** @type {ChapterMark} */
            let hakunekoChaptermarkEntry = /** @type {ChapterMark} */ (chaptermarks.find(cm => cm.mangaID === hkey && cm.connectorID === hconnector));
            if (hakunekoChaptermarkEntry) {
                hakunekoChaptermarkEntry.chapterID = newChapterID;
                hakunekoChaptermarkEntry.chapterTitle = newChapterID;
            } else {
                chaptermarks.push({
                    connectorID: hconnector,
                    mangaID: hkey,
                    chapterID: newChapterID,
                    chapterTitle: newChapterID
                });
            }

            // 3.2 Update hakuneko table's hchapter.
            const hakunekoEntry = hakuneko[key];
            if (hakunekoEntry && 'hchapter' in hakunekoEntry) {
                hakunekoEntry.hchapter = newChapter;
            }
            await this.hakuneko.db.write();
        } catch (error) {
            console.error('Failed to update hakuneko.json:', error);
        }

        // 4. Update manga.json.
        try {
            // Re-read manga.json to be safe.
            await this.db.read();

            // Also update in the hakuneko table if it exists there
            const obj = Object.values(this.db.data.hakuneko).find(o => o.key === key);
            if (obj && 'hchapter' in obj) {
                obj.hchapter = newChapter;
            }

            await this.db.write();
        } catch (error) {
            console.error('Failed to update manga.json:', error);
        }

        console.log(`Successfully updated chapter for manga ${key} to ${newChapter}.`);
    }
};
exports.Manga = Manga;
module.exports = Manga;

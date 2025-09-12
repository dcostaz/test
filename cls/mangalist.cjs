'use strict';
const __root = require('app-root-path').path;
const path = require('path');

/** @type {EnumsConstructor} - Enums class Static Elements. */
const Enums = require(path.join(__root, 'enums', 'mangalist.cjs'));

const { Low } = require('lowdb');
const { JSONFile } = require('lowdb/node');
const _ = require('lodash');

/** @type {SettingsConstructor} - Settings Class Static Elements */
const Settings = require(path.join(__root, 'cls', 'settings.cjs'));

/** @type {MangaUpdatesConstructor} - MangaUpdates Class Static Elements */
const MangaUpdates = require(path.join(__root, 'cls', 'mangaupdates.cjs'));

class MangaList {
    /**
     * Constructor for MangaList class.
     * @param {!MangaListParameters} args - Constructor parameters.
     */
    constructor(args) {
        // Destructure the arguments
        const { db, settings, mangaupdates } = args;

        /** @type {Low} - References the mangalist database.*/
        this.db = db;

        /** @type {SettingsClass} - References the manga-list application settings.*/
        this.settings = settings;

        /** @type {MangaUpdatesClass|undefined} - Reference to the mangaupdates instance.*/
        this.mangaupdates = mangaupdates;

        /** @type {string} - Path to the manga-list application database directory.*/
        this.databaseDir = this.settings.mangalist.database.directoryPathName;
    }

    /**
     * Factory function to perform initialization steps and return an instance of MangaList.
     * @param {SettingsClass} settings - The reference to the Settings instance to be used in MangaList initialization.
     * @param {MangaUpdatesClass} mangaupdates - The reference to the MangaUpdates instance to be used in MangaList initialization.
     * @returns {Promise<MangaList|null>} A promise that resolves to an instance of MangaList or null if initialization fails.
     * @static
     */
    static async init(settings, mangaupdates) {
        // Get the reference to the manga-list settings
        const mangalist = settings.mangalist;

        if (!mangalist || !mangalist.database || !mangalist.database.directoryPathName)
            throw new Error('(init) manga-list settings not found or database path is missing.');

        // Get the path for the manga database
        /** @type {string} - Directory where JSON databases are located.*/
        const databaseDir = path.join(mangalist.database.directoryPathName, mangalist.database.mangalist);

        // Create adapter for file
        /** @type {JSONFile<MangaListDBDefaults>} - Adapter for the Manga JSON file. */
        const dbAdapter = new JSONFile(databaseDir);

        /** @type {MangaListDBDefaults} - Default tables for the manga database. */
        const dbDefaultData = { readinglist: [] };

        // Setup the connection db to the JSON settings file
        const _db = new Low(dbAdapter, dbDefaultData);

        // If the db connection not setup, return null
        if (!_db)
            throw new Error('(init) Failed to load database.');

        // If the db connection ok, read from it
        if (_db) await _db.read();

        // Make sure that the database existing or create it
        for (const key in dbDefaultData) {
            if (!(key in _db.data)) {
                _db.data[key] = dbDefaultData[key];

                // Ensure all changes are written to the database
                await _db.write();
            }
        }

        // Build the settings parameters object
        /** @type {MangaListParameters} - Parameters for initializing MangaList. */
        const mangalistParams = { db: _db, settings: settings, mangaupdates: mangaupdates };

        /** @type {MangaList} - Instance of the MangaList class. */
        let mangalistInstance = Object.create(null);
        try {
            // Create a new instance of MangaList with the initialized database and settings
            mangalistInstance = new MangaList(mangalistParams);
        } catch (error) {
            throw new Error(`(init) Error creating MangaList instance: ${error}`);
        }

        // Initialize the reading list from MangaUpdates
        await mangalistInstance.getReadingList();

        // Return a new instance of MangaList with the initialized database and settings
        return mangalistInstance;
    }

    /**
     * Refresh the MangaUpdates reading list stored in the database.
     * This part is intented to be used by the initialization and refreshing of the reading list.
     * It fetches the reading list from MangaUpdates and saves it to the database.
     * @param {boolean} [refresh] - Force reload from MangaUpdates. Defaults to false.
     * @returns {Promise<void>} - Returns a promise that resolves when the reading list is refreshed.
     */
    async getReadingList(refresh = false) {
        // Initialize the manga list variable
        /** @type {MangaUpdatesReadingListSearchResultsEntry[]} - MangaUpdates reading list object.*/
        let mangaReadingList = [];

        // Check if temp data has readinglist
        if (!this.db || !this.db.data || !this.db.data.readinglist) {
            console.log('Database does not have readinglist table.');
            return;
        }

        // Update from database
        await this.db.read();

        mangaReadingList = this.db.data.readinglist;

        if (mangaReadingList && Object.keys(mangaReadingList).length !== 0 && !refresh)
            return;

        mangaReadingList = await this._getMangaUpdatesReadingList(refresh);

        if (mangaReadingList) {
            // Save the reading list to temp data
            this.db.data.readinglist = mangaReadingList;
            await this.db.write();
        }

        return;
    }

    /**
     * Wrapper for the call to get the reading list from MangaUpdates.
     * This is the 
     * @param {boolean} [refresh] - Force reload from MangaUpdates. Defaults to false.
     * @returns {Promise<MangaUpdatesReadingListSearchResultsEntry[]>} - Returns a promise that resolves to the MangaUpdates reading list.
     * @private
     */
    async _getMangaUpdatesReadingList(refresh = false) {
        // Initialize the manga list variable
        /** @type {MangaUpdatesReadingListSearchResultsEntry[]} - MangaUpdates reading list object.*/
        let mangaReadingList = [];

        /** @type {MangaupdatesReadinglistType} */
        const mangaUpdatesListID = Enums.MANGAUPDATES_READINGLIST_TYPE.READINGLIST; // Selected Reading List

        try {
            // Call MangaUpdates API to get the reading list
            if (this.mangaupdates) {
                if (refresh) await this.mangaupdates.refresh(true);

                mangaReadingList = await this.mangaupdates.getListSeries(mangaUpdatesListID);
            }
        }
        catch (error) {
            console.error('(_getMangaUpdatesReadingList-->mangaupdates.getListSeries) Error:', error);
        }

        // Check if the reading list was loaded
        if (!mangaReadingList || !mangaReadingList.length) {
            console.log('Call to MangaUpdates returned an empty reading list.');
        }

        // All good, we have the reading list
        return mangaReadingList
    }
};
module.exports = MangaList;
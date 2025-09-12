'use strict';
const __root = require('app-root-path').path;
const path = require('path');
const Enums = require(path.join(__root, 'enums', 'mangalist.cjs'));

const { Low } = require('lowdb');
const { JSONFile } = require('lowdb/node');

// const _ = require('lodash');

class Settings {
    /**
     * Constructor for MangaList class.
     * @param {SettingsParameters} args - Constructor parameters.
     */
    constructor(args) {
        // Destruct the arguments
        const { db, mangalist, mangaupdates, hakuneko, redis } = args;

        /** @type {Low} - References the settings database. */
        this.db = db;

        /** @type {SettingsMangaList} - References the settings array. */
        this.mangalist = mangalist;

        /** @type {SettingdMangaUpdates} - References the settings array. */
        this.mangaupdates = mangaupdates;

        /** @type {SettingsHakuneko} - References the settings array. */
        this.hakuneko = hakuneko;

        /** @type {SettingsRedis} - References the settings array. */
        this.redis = redis;
    }

    /**
     * Factory function to perform initialization steps and return an instance of Settings.
     * @returns {Promise<Settings>} A promise that resolves to an instance of Settings or null if initialization fails.
     */
    static async init() {
        // Create adapter for file
        // This is the only JSON file that will always be in db under the root directory
        /** @type {JSONFile<SettingsDBDefaults>} - Adapter for the settings JSON file. */
        const dbAdapter = new JSONFile(path.join(__root, 'db', 'settings.json'));

        /** @type {SettingsDBDefaults} - Default tables for the settings database. */
        const dbDefaultData = { mangalist: [], mangaupdates: [], hakuneko: [], redis: [] };

        // Setup the connection db to the JSON settings file
        /** @type {Low} - References the settings database. */
        const _db = new Low(dbAdapter, dbDefaultData);

        // If the db connection not setup, return null
        if (!_db) return Object.create(Settings);

        // Load and initialize db tables if not already present
        await _db.read();

        // Make sure that each table from dbDefaultData exist in the database or create them
        for (const key in dbDefaultData) {
            if (!(key in _db.data)) {
                // If the key does not exist in the database, initialize it with default data
                _db.data[key] = dbDefaultData[key];

                // Ensure all changes are written to the database
                await _db.write();
            }
        }

        // Get the settings from the database
        /** @type {SettingsMangaList} - Cache of the mangalist settings. */
        const _mangalist = JSON.parse(JSON.stringify(_db.data.mangalist[0])) || {};

        /** @type {SettingdMangaUpdates} - Cache of the mangaupdates settings. */
        const _mangaupdates = JSON.parse(JSON.stringify(_db.data.mangaupdates[0])) || {};

        /** @type {SettingsHakuneko} - Cache of the hakuneko settings. */
        const _hakuneko = JSON.parse(JSON.stringify(_db.data.hakuneko[0])) || {};

        /** @type {SettingsRedis} - Cache of the redis settings. */
        const _redis = JSON.parse(JSON.stringify(_db.data.redis[0])) || {};

        // Build the settings parameters object
        /** @type {SettingsParameters} - Parameters for initializing Settings. */
        const settingsParams = {
            db: _db,
            mangalist: _mangalist,
            mangaupdates: _mangaupdates,
            hakuneko: _hakuneko,
            redis: _redis
        };

        /** @type {Settings} - Instance of Settings or null if initialization fails. */
        let settingsInstance = Object.create(null);
        try {
            // Create a new instance of Settings with the initialized database and settings
            settingsInstance = new Settings(settingsParams);
        } catch (error) {
            console.error('Error initializing Settings:', error);
            return Object.create(Settings); // Return null if initialization fails
        }

        // Perform an initial settings refresh
        settingsInstance.refresh();

        // Return a new instance of Settings with the initialized database and settings
        return settingsInstance;
    }

    /**
     * Gets database from Settings.
     * @returns {Low | undefined} A reference to Setting's database
     */
    get db() {
        /** @type {Low | undefined} - Instance of Settings or undefined if initialization fails. */
        const currentdb = this._db;

        // Return the database reference  
        return currentdb;
    }

    /**
     * Assign database to Settings.
     * @param {!Low} value - The reference to the database.
     * @throws {TypeError} - If the parameter is not an instance of Low.
     */
    set db(value) {
        // Set the database reference  
        if (value instanceof Low) {
            this._db = value;
        } else {
            throw new TypeError('Expected an instance of Low for db');
        }
    }

    /**
     * Returns the settings as a string.
     * @returns {string} A string representing the setting, or empty if not available.
     */
    stringify() {
        // If the settings is not initialized, return an empty string
        if (!this.mangalist || !this.mangaupdates || !this.hakuneko || !this.redis)
            return "";
        else
            // Return the settings as a JSON string
            return JSON.stringify({
                ...this.mangalist,
                ...this.mangaupdates,
                ...this.hakuneko,
                ...this.redis
            });
    }

    /**
     * This function reads the settings from the database and updates the `settings` property.
     * @throws {Error} If the database read operation fails.
     */
    async refresh() {
        // Check if the database is initialized
        if (!this.db) {
            throw new Error('Database is not initialized.');
        }

        try {
            // Read database
            await this.db.read();

            // Update the settings property with the data from the database
            this.mangalist = JSON.parse(JSON.stringify(this.db.data.mangalist[0])) || {};
            this.mangaupdates = JSON.parse(JSON.stringify(this.db.data.mangaupdates[0])) || {};
            this.hakuneko = JSON.parse(JSON.stringify(this.db.data.hakuneko[0])) || {};
            this.redis = JSON.parse(JSON.stringify(this.db.data.redis[0])) || {};
            this.all = JSON.parse(JSON.stringify({
                ...this.mangalist,
                ...this.mangaupdates,
                ...this.hakuneko,
                ...this.redis
            })) || {};
        }
        catch (error) {
            console.error('Error reading settings from database:', error);
            throw new Error('Failed to read settings from database.');
        }
    }
};
module.exports = Settings;
'use strict';
const __root = require('app-root-path').path;
const path = require('path');
const Enums = require(path.join(__root, 'enums', 'mangalist.cjs'));

const fs = require("fs").promises;

const { Low } = require('lowdb');
const { JSONFile } = require('lowdb/node');
const _ = require('lodash');

/** @type {UtilsConstructor} - Utils Class static members. */
const Utils = require(path.join(__root, 'utils', 'utils.cjs'));

class Hakuneko {
    /**
     * Constructor for MangaList class.
     * @param {!HakunekoParameters} args - Constructor parameters.
     */
    constructor(args) {
        // Destructure the arguments
        const { db, settings } = args;

        /** @type {Low<HakunekoDBDefaults>} - References the Settings database. */
        this.db = db;

        /** @type {HakunekoSettings} - Cache of the hakuneko settings. */
        this.settings = settings;
    }

    /**
     * Factory function to perform initialization steps and return an instance of Hakuneko.
     * @param {SettingsClass} settings - The manga object to be used in Hakuneko.
     * @return {Promise<Hakuneko|null>} A promise that resolves to an instance of Hakuneko or null if initialization fails.
     */
    static async init(settings) {
        // Get the reference to the manga-list settings
        /** @type {SettingsMangaList} - Cache of the manga-list settings. */
        const mangalist = settings.mangalist;

        if (!mangalist || !mangalist.database || !mangalist.database.directoryPathName) {
            console.error('MangaList settings not found or database path is missing.');
            return null; // Return null if settings are not found
        }

        // Get the path for the manga database
        /** @type {string} - Path to the manga-list database directory. */
        const databaseDir = path.join(mangalist.database.directoryPathName, mangalist.database.hakuneko);

        // Create adapter for file
        /** @type {JSONFile<HakunekoDBDefaults>} - Adapter for the settings JSON file. */
        const dbAdapter = new JSONFile(databaseDir);

        /** @type {HakunekoDBDefaults} - Default tables for the manga database. */
        const dbDefaultData = { hakuneko: Object.create(null), bookmarks: [], chaptermarks: [], mangaimages: [] };

        // Setup the connection db to the JSON settings file
        /** @type {Low<HakunekoDBDefaults>} - References the settings database. */
        const _db = new Low(dbAdapter, dbDefaultData);

        // If the db connection not setup, return null
        if (!_db)
            throw new Error('(init) Failed to load database.');

        // Load and initialize db tables if not already present
        await _db.read();

        // Make sure that the database existing or create it
        for (const key in dbDefaultData) {
            if (!(key in _db.data)) {
                // If the key does not exist in the database, initialize it with default data
                _db.data[key] = dbDefaultData[key];
            }
        }

        // Ensure all changes are written to the database
        await _db.write();

        /** @type {HakunekoSettings} - Cache of the manga-list/mangalist/hakuneko settings. */
        const _settings = JSON.parse(JSON.stringify({
            mangalist: settings.mangalist,
            redis: settings.redis,
            hakuneko: settings.hakuneko,
            mangaupdates: settings.mangaupdates
        })) || {};

        // Build the Hakuneko parameters object
        /** @type {HakunekoParameters} - Parameters for initializing Hakuneko. */
        const hakunekoParams = { db: _db, settings: _settings };

        /** @type {Hakuneko|null} - Instance of the Hakuneko class. */
        let hakunekoInstance = null;
        try {
            // Create a new instance of Hakuneko with the initialized database and settings
            hakunekoInstance = new Hakuneko(hakunekoParams);
        } catch (error) {
            console.error('Error initializing Hakuneko:', error);
            return null; // Return null if initialization fails
        }

        /**
         * Perform all Instance related initilization work
         * Steps indicate dependencies, so they need to be carefully arranged
         */

        // Step 1 - Rebuild hakuneko image database
        await hakunekoInstance.rebuildHakunekoImages();

        // Step 2 - Rebuild bookmarks, chaptermarks and hakuneko database
        await hakunekoInstance.rebuildHakuneko();

        // Return a new instance of Hakuneko with the initialized database and settings
        return hakunekoInstance;
    }

    /**
     * Builds the Hakuneko manga entries from the database.
     * @returns {Promise<void>} A promise that resolves to an object containing the Hakuneko manga entries.
     */
    async rebuildHakunekoImages() {
        // Get the reference to the manga-list settings
        /** @type {SettingsMangaList} - Cache of the manga-list settings. */
        const mangalist = this.settings.mangalist;

        // Assign to local variable for easier reference
        const db = this.db;

        // If called before the database is configured just return
        if (!db) {
            console.warn('(rebuildHakunekoImages) Error: The instance is not properly set-up.');
            return;
        }

        // Make sure it's up to date
        await db.read();

        // Directory where manga images are stored
        /** @type {string} - Directory path for manga images. */
        const imageDir = path.join(mangalist.images.directoryPathName);

        /** @type FileEntry[]} - List of image files in the manga directory. */
        const imageFiles = await fs.readdir(imageDir, { withFileTypes: true })
            .then(entries => entries.filter(entry => entry.isFile() && entry.name.endsWith('.jpg')))
            .catch(err => {
                console.error('Error reading image directory:', err);
                return [];
            });

        // Over-ride existing entries with the current list (only file name)
        db.data.mangaimages = imageFiles.map(file => ({name: file.name}));

        // Ensure all changes are written to the database
        await db.write();

        return;
    }

    /**
     * Updates the Hakuneko database with bookmarks, chapter marks, and manga entries.
     * This method retrieves bookmarks and chapter marks from the specified paths,
     * builds the Hakuneko manga entries, and writes the updated data to the database.
     * @returns {Promise<void>} A promise that resolves to an object containing the Hakuneko manga entries.
     */
    async rebuildHakuneko() {
        // Assign to local variable for easier reference
        const db = this.db;

        // If called before the database is configured just return
        if (!db || !db.data.mangaimages) {
            console.warn('(rebuildHakuneko) Error: The instance is not properly set-up or missing required tables.');
            return;
        }

        // Make sure it's up to date
        await db.read();

        const existingEntries = db.data.hakuneko || {};

        // Get the bookmarks, chaptermarks and hakuneko from the Hakuneko JSON files
        //
        /** @type {string} - Path to the bookmarks file. */
        const bookmarksPathName = this.settings.hakuneko.paths.bookmarks;

        /** @type {string} - Path to the chaptermarks file. */
        const chaptersPathName = this.settings.hakuneko.paths.chaptermarks;

        // Check if the bookmarks and chaptermarks files are available
        if (!await Hakuneko._hakunekoAvailble(bookmarksPathName, chaptersPathName)) {
            console.error('Hakuneko bookmarks or chapter marks files are not available.');
            return;
        }

        // Get the bookmarks from Hakuneko
        /** @type {Bookmark[]} - Bookmarks from Hakuneko. */
        const bookmarks = await Hakuneko.getHakunekoBookmarks(bookmarksPathName);

        // Overwrite bookmarks table in the database
        db.data.bookmarks = bookmarks;

        // Get the chaptermarks from Hakuneko
        /** @type {ChapterMark[]} - Chapter marks from Hakuneko. */
        const chaptermarks = await Hakuneko.getHakunekoChaptermarks(chaptersPathName);

        // Overwrite chaptermarks table in the database
        db.data.chaptermarks = chaptermarks;

        // Get hakuneko manga images
        /** @type {MangaImage[]} */
        const imageFiles = db.data.mangaimages;

        // Create a Set for quick lookup of image files
        /** @type {Set<string>} - Set of image file names for quick lookup. */
        const imageFilesLookup = new Set(imageFiles.map(file => file.name));

        // Create a temporary object to hold Hakuneko manga entries, keyed by slug
        /** @type {Record<string, HakunekoEntry>} */
        const hakuneko = Object.create(null); // temp object, keyed by slug

        for (const hBookMark of bookmarks) {
            // Slug of the manga title
            /** @type {string} - Slug of the manga title. */
            const slug = Utils.folderNameToSlug(hBookMark.title.manga);

            // Create or update entry
            /** @type {any} - Existing entry for the manga. */
            let existingEntry = Object.values(existingEntries).find(e => e.key === slug);

            // Create or hydrate entry
            hakuneko[slug] = {
                hkey: hBookMark.key.manga,
                hmanga: hBookMark.title.manga,
                hconnector: hBookMark.key.connector,
                hconnectorDescription: hBookMark.title.connector,
                hfolder: Utils.sanitizedFolderName(hBookMark.title.manga),
                himageAvailable: imageFilesLookup.has(slug + '.jpg'),
                hlastchapter: existingEntry?.hlastchapter || 0,
                hchapter: NaN,
                hlastModified: existingEntry?.hlastModified || null
            };
        }

        // Dry function to build a key for chapter marks
        /**
         * Builds a key for chapter marks based on mangaID and connectorID.
         * @param {string} mangaID - The ID of the manga.
         * @param {string} connectorID - The ID of the connector.
         * @returns {string} A string key in the format "mangaID::connectorID".
         */
        const buildKey = (mangaID, connectorID) => `${mangaID}::${connectorID}`;

        // Create a lookup map for chapter marks
        /** @type {Map<string, ChapterMark>} - Map to hold chapter marks keyed by mangaID and connectorID. */
        const chapterMap = new Map();

        // Populate the chapterMap with chapter marks
        for (const mark of chaptermarks) {
            // Build the key for the chapter mark
            /** @type {string} - Key for the chapter mark. */
            const key = buildKey(mark.mangaID, mark.connectorID);

            // Set the chapter mark in the map
            chapterMap.set(key, mark);
        }

        // Update hakuneko using the lookup
        Object.values(hakuneko).forEach(hData => {
            // Build the lookup key for the current hakuneko entry
            /** @type {string} - Lookup key for the current hakuneko entry. */
            const lookupKey = buildKey(hData.hkey, hData.hconnector);

            // Get the chapter mark from the map using the lookup key
            /** @type {ChapterMark|undefined} - Chapter mark corresponding to the lookup key. */
            const chapterMark = chapterMap.get(lookupKey);

            if (chapterMark) {
                /** @type {RegExp} - Regex to match chapter numbers. */
                const CHAPTERREGEX = Utils.CHAPTERREGEX; // Regex to match chapter numbers

                // Match the chapter title against the regex
                /** @type {RegExpMatchArray|null} - Match result from the chapter title. */
                const match = chapterMark.chapterTitle.match(CHAPTERREGEX);

                // If a match is found, parse the chapter number and update hchapter
                // The match[1] is expected to be the volumen number based on the regex which is not needed here
                // The match[2] is expected to be the chapter number based on the regex
                // If no match is found, default to chapter 1
                hData.hchapter = match ? parseFloat(match[2]) : 1;
            }
        });

        // Overwrite hakuneko table in the database
        db.data.hakuneko = hakuneko;

        // Ensure all changes are written to the database
        await db.write();

        return;
    }

    async sortHakunekoBookmarks() {
        // Sort by title.manga
        /** @type {Bookmark[]} - Bookmarks. */
        const bookmarks = this.db.data.bookmarks;

        const sorted = bookmarks.sort((a, b) => {
            return a.title.manga.localeCompare(b.title.manga);
        });

        console.log(sorted);
    }

    /**
     * Gets bookmarks from Hakuneko.
     * @param {string} bookmarksPathName - The path to the bookmarks file.
     * @returns {Promise<any[]>} A promise that resolves to an array of bookmarks.
     * @example
     * const bookmarks = await Hakuneko._getHakunekoBookmarks('path/to/bookmarks.json');
     * @static
     */
    static async getHakunekoBookmarks(bookmarksPathName) {
        const jsonData = await Hakuneko._loadJson(bookmarksPathName);

        return jsonData || [];
    }

    /**
     * Gets chapter marks from Hakuneko.
     * @param {string} chaptersPathName - The path to the chapter marks file.
     * @returns {Promise<any[]>} A promise that resolves to an array of chapter marks.
     * @example
     * const chapterMarks = await Hakuneko._getHakunekoChaptermarks('path/to/chapters.json');
     * @static
     */
    static async getHakunekoChaptermarks(chaptersPathName) {
        const jsonData = await Hakuneko._loadJson(chaptersPathName);

        return jsonData || [];
    }

    /**
     * Checks if the Hakuneko bookmarks and chapter marks files are available.
     * @param {string} bookmarksPathName - The path to the bookmarks file.
     * @param {string} chaptersPathName - The path to the chapter marks file.
     * @return {Promise<boolean>} A promise that resolves to true if both files are available, false otherwise.
     * @example
     * const isAvailable = await Hakuneko.hakunekoAvailble('path/to/bookmarks.json', 'path/to/chapters.json');
     * @static
     * @private
     */
    static async _hakunekoAvailble(bookmarksPathName, chaptersPathName) {
        // Check if the bookmarks and chaptermarks files exist
        return fs.access(bookmarksPathName)
            .then(() => fs.access(chaptersPathName))
            .then(() => true)
            .catch(() => false);
    }

    /**
     * Loads a JSON file and parses its content.
     * @param {string} fileName - The name of the JSON file to load.
     * @returns {Promise<any>} A promise that resolves to the parsed JSON data or undefined if an error occurs.
     * @example
     * const data = await Hakuneko._loadJson('path/to/file.json');
     * @static
     * @private
     */
    static async _loadJson(fileName) {
        try {
            // Read the file with UTF-8 encoding and 'r' flag
            const data = await fs.readFile(fileName, { encoding: 'utf-8', flag: 'r' });
            try {
                // Parse the JSON data
                return JSON.parse(data);
            } catch (parseErr) {
                console.error('Failed to parse JSON:', parseErr);
                return;
            }
        } catch (err) {
            console.error('Failed to read file:', err);
            return;
        }
    }
};
module.exports = Hakuneko;
exports.Hakuneko = Hakuneko;
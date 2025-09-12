'use strict';

class Enums {
    /**
     * Constructor for Enums class.
     */
    constructor() {
    }

    /**
     * Enum for settings type.
     * @readonly
     * @enum {SettingType}
     */
    static SETTINGS_TYPE = Object.freeze({
        MANGALIST: 'manga-list', // manga-list application settings
        MANGAUPDATES: 'mangaupdates' // MangaUpdates API settings
    });

    /**
     * List identifiers for MangaUpdates lists.
     * @readonly
     * @enum {MangaupdatesReadinglistType}
     */
    static MANGAUPDATES_READINGLIST_TYPE = Object.freeze({
        READINGLIST: 0,
        WISHLIST: 1,
        COMPLETELIST: 2,
        UNFINISHEDLIST: 3,
        ONHOLDLIST: 4
    });

    /**
     * Enum for mangaupdatesTitleMatch values.
     * @readonly
     * @enum {MangaupdatesTitleMatch}
     */
    static MANGAUPDATES_TITLE_MATCH = Object.freeze({
        TITLE_NO_MATCH: 'tn', // No match available
        TITLE_MATCH: 'tm', // Title match with MangaUpdates (default)
        TITLE_SIMILAR: 'ts', // Title similar
        ASSOCIATED_TITLE: 'ta', // Associated title match
        ASSOCIATED_TITLE_SIMILAR: 'tz',  // Associated title similar
        TITLE_MATCH_REVIEW: 'tr' // Title match by user review
    });

    /**
     * Enum for the return status of the getReadingListSerieDetail process.
     * @readonly
     * @enum {GetReadinglistSeriedetailStatus}
     */
    static GET_READINGLIST_SERIEDETAIL_STATUS = Object.freeze({
        SUCCESS: 'success', // Serie processed
        SKIPPED: 'skipped', // Serie already exists in the database
        IN_REVIEW: 'in_review', // Serie is already in review
        FOR_REVIEW: 'for_review', // Serie marked for review
        NO_DETAILS: 'no_details', // No details found for the serie
        FAILED_GET: 'failed_get', // Failed to get details
        ERROR: 'error' // Error processing the serie
    });
}
exports.Enums = Enums;
module.exports = Enums;
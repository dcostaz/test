'use strict';
const __root = require('app-root-path').path;
const path = require('path');
const Enums = require(path.join(__root, 'enums', 'mangalist.cjs'));

const fs = require("fs").promises;
const Stats = require("fs").Stats;

class Utils {
    constructor() { }

    // Regular expression to match chapter and volume information
    // Example matches: "Vol. 1 Ch. 2", "v.1 c.2", "Volume 1 Chapter 2", "v1 c2", etc.
    // It captures volume and chapter numbers, allowing for optional prefixes like "Vol.", "v.", "Volume", "Ch.", "c.", etc.
    // The regex captures volume as the first group and chapter as the second group, both as floating point numbers (e.g., "1.0", "2.5").
    // It also allows for optional spaces or dashes between the volume and chapter parts.
    //* @type {RegExp} */
    static CHAPTERREGEX = /(?:v(?:ol(?:ume)?)?\.?\s*(\d+(?:\.\d+)?))?[\s\-]*?(?:c(?:h(?:apter)?)?\.?\s*(\d+(?:\.\d+)?))?/i;

    /**
     * Helper to convert Slug text to Camel text
     * @param {string} str 
     * @param {boolean} [capitalizeFirst] 
     * @returns {string}
     * @example
     *    toCamel("get-hakuneko-reading-list")
     *  *    Results:
     *       get-hakuneko-reading-list => getHakunekoReadingList
     * @description
     * 🔹 str.replace(...)
     * - This calls the replace method on a string, which searches for matches and replaces them.
     * 
     * 🔹 /–([a-z])/g
     * - This is a regular expression that matches:
     *    - A hyphen (-)
     *    - Followed by a lowercase letter ([a-z])
     * 
     * - The parentheses () around [a-z] create a capture group, so we can extract the letter after the hyphen.
     * - The g flag means global, so it replaces all matches in the string, not just the first.
     *
     *  🔹 (_, char) => char.toUpperCase()
     * - This is the replacement function:
     *    - _ is the full match (e.g., -a), which we ignore.
     *    - char is the captured letter (e.g., a).
     *    - It returns char.toUpperCase(), converting it to uppercase (e.g., A).
     * 
     *  🔹"background-color" → "backgroundColor"
     *
     * - If capitalizeFirst is true, this line runs:
     * 
     *  🔹 result.charAt(0).toUpperCase() + result.slice(1)
     * - result.charAt(0) → "b"
     * - .toUpperCase() → "B"
     * - result.slice(1) → "ackgroundColor"
     * 
     *  🔹 Combined → "BackgroundColor"
     */
    static kebabToCamel(str, capitalizeFirst = false) {
        let result = str.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
        // Capitalize 'id' if it's the last part
        result = result.replace(/Id$/, 'ID');
        if (capitalizeFirst) {
            result = result.charAt(0).toUpperCase() + result.slice(1);
        }
        return result;
    }

    /**
     * Sanitizes a folder name by removing invalid characters for the OS and normalizing the string.
     * @param {string} fileName - The name of the folder to sanitize.
     * @returns {string} The sanitized folder name.
     * @example
     * const sanitized = Manga.sanitizedFolderName('My Manga <Series>: Volume 1 / Chapter 2?');
     * console.log(sanitized); // Output: 'My Manga Series Volume 1 Chapter 2'
     * @static
     */
    static sanitizedFolderName(fileName) {
        if (!fileName || typeof (fileName) !== 'string')
            return '';

        return fileName
            .normalize('NFKD') // Normalize Unicode
            .replace(/[<>:“”"/\\|?*\u0000-\u001F]/g, '') // Remove bad filesystem characters
            .replace(/\s+/g, ' ') // Collapse multiple spaces
            .trim()
            .replace(/\.$/, ''); // Remove trailing period
    }

    /**
     * Convert to a normalized lowercase slug from a folder name.
     * This will be used as a unique identifier (key) for the series.
     * The series directory will always be used for the slug.
     * @param {string} folderName - The name of the folder to convert to a slug.
     * @return {string} The slugified folder name.
     * @example
     * const slug = Manga.folderNameToSlug('My Manga Series: Volume 1 / Chapter 2');
     * console.log(slug); // Output: 'my-manga-series-volume-1-chapter-2'
     * @static
     */
    static folderNameToSlug(folderName) {
        if (typeof folderName !== 'string') return '';
        const slug = Utils.sanitizedFolderName(folderName);

        return slug.replace(/[,!.\"]/g, "").replace(/\s+/g, "-").toLowerCase();
    }

    /**
     * Convert to a normalized lowercase text.
     * @param {string} text - The name of the folder to convert to a slug.
     * @return {string} The slugified folder name.
     * @example
     * const slug = Manga.folderNameToSlug('My Manga Series: Volume 1 / Chapter 2');
     * console.log(slug); // Output: 'my-manga-series-volume-1-chapter-2'
     * @static
     */
    static normalizeText(text) {
        if (typeof text !== 'string') return '';
        const outputText = Utils.sanitizedFolderName(text);

        return outputText.toLowerCase();
    }

    /**
     * Dry function to shallow clone an object.
     * @template {{ [key: string]: unknown }} T
     * @param {T} obj - Object to clone.
     * @returns {T} Shallow-cloned object.
     * @static
     */
    static cloneShallow = obj => ({ ...obj });

    /**
     * Dry function to deep clone an object.
     * @template {{ [key: string]: unknown }} T
     * @param {T} obj - Object to clone.
     * @returns {T} Shallow-cloned object.
     * @static
     */
    static cloneDeep = obj => JSON.parse(JSON.stringify(obj));

    /**
     * Get additional properties from an object based on a list of fields.
     * This method will return a new object with the specified fields from the source object.
     * If a field does not exist in the source object, it will be set to an empty string.
     * Get selected properties from one object and merge into another, with optional cloning.
     * @param {string[]} fields - List of fields to copy.
     * @template {{ [key: string]: unknown }} T
     * @param {T} fromObj - Source object.
     * @param {{ [key: string]: unknown }} toObj - Target object.
     * @param {Object} options - Configuration options.
     * @param {'shallow' | 'deep'} [options.clone='deep'] - Cloning strategy.
     * @returns {{ [key: string]: unknown }} New object with selected properties.
     * @static
     */
    static getAdditionalProperties(fields, fromObj, toObj = Object.create(null), options = { clone: 'deep' }) {
        if (!fromObj || typeof fromObj !== 'object') fromObj = Object.create(null);

        const cloneFn = options.clone === 'shallow' ? Utils.cloneShallow : Utils.cloneDeep;
        const result = cloneFn(toObj);

        fields.forEach(field => {
            if (Object.prototype.hasOwnProperty.call(fromObj, field)) {
                result[field] = fromObj[field];
            }
        });

        return result;
    }

    /**
     * Dry function to wait for a specified time
     * Time ( ms  is provided in milli-seconds
     * @param {number} ms
     * @returns {Promise<void>}
     * @static
     */
    static async wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Get all method names defined on the prototype of a class instance.
     * Excludes constructor and non-function properties.
     * @param {object} obj
     * @returns {string[]} Method names (excluding constructor)
     * @static
     */
    static getClassMethodNames(obj) {
        const proto = Object.getPrototypeOf(obj);
        return Object.getOwnPropertyNames(proto).filter((key) => {
            return typeof proto[key] === 'function' && key !== 'constructor';
        });
    }

    /**
     * Checks if a value is a valid IpcConfig object.
     * @param {unknown} value
     * @returns {value is IpcConfig}
     * @static
     */
    static isIpcConfig(value) {
        return (
            typeof value === 'object' &&
            value !== null &&
            (
                'context' in value ||
                'log' in value ||
                'validateArgs' in value ||
                'requiresResponse' in value ||
                'name' in value
            )
        );
    }

    /**
     * @param {unknown} error
     * @returns {Error}
     * @static
     */
    static normalizeError(error) {
        if (error instanceof Error) return new Error(error.message);
        return new Error(String(error));
    }

    /**
     * Parses a value into a boolean.
     * @param {unknown} value
     * @returns {boolean}
     * @static
     */
    static parseBoolean(value) {
        if (typeof value === 'boolean') return value;
        if (typeof value === 'string') {
            return value.trim().toLowerCase() === 'true';
        }
        return Boolean(value);
    }

}
exports.Utils = Utils; // Needed to allow static calls from other modules. Example: const folder = Utils.sanitizedFolderName(folderName);
module.exports = Utils;

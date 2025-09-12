'use strict';
const __root = require('app-root-path').path;
const path = require('path');
const Enums = require(path.join(__root, 'enums', 'mangalist.cjs'));

const fs = require("fs").promises;
const readFileSync = require("fs").readFileSync;

function normalizeTitle(text) {
    return text ? text.replace(/’/g, "'").replace(/:/g, "").replace(/\?/g, "") : "";
}
exports.normalizeTitle = normalizeTitle;

function titleToSlug(text) {
    const slug = text
        .normalize('NFKD') // Normalize Unicode
        .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '') // Remove bad filesystem characters
        .replace(/\s+/g, ' ') // Collapse multiple spaces
        .trim()
        .replace(/\.$/, ''); // Remove trailing period
    return slug.replace(/[,!.\"]/g, "").replace(/\s+/g, "-").toLowerCase();
}
exports.titleToSlug = titleToSlug;

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
exports.wait = wait;

async function getDirectories(srcPath) {
    // Check if directory PathName is provided
    if (!srcPath) {
        console.log('No directory path provided.');
        return [];
    }

    const entries = await fs.readdir(srcPath, { withFileTypes: true });

    const dirsWithStats = await Promise.all(
        entries
            .filter(dirent => dirent.isDirectory())
            .map(async dirent => {
                const fullPath = path.join(srcPath, dirent.name);
                const stats = await fs.stat(fullPath);
                return { name: dirent.name, mtime: stats.mtime };
            })
    );

    return dirsWithStats
        .sort((a, b) => b.mtime.getTime() - a.mtime.getTime()) // latest first
        .map(dir => dir.name) // return just names
        .filter(dir => !dir.includes("#recycle")); // Filter unwanted directories
}
exports.getDirectories = getDirectories;

async function loadJson(fileName) {
    try {
        const data = readFileSync(fileName, { encoding: 'utf-8', flag: 'r' });
        try {
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
exports.loadJson = loadJson;

// Helper to grab fields from fromObj based on a pre-defined list of fields, to avoid doing it one by one
const getAdditionalProperties = (fields, fromObj, toObj = {}) => {
    // Make sure fromObj is not Null
    if (!fromObj) fromObj = {};
    // Clone toObj to avoid mutation (shallow + deep where needed)
    const cloneDeep = obj => JSON.parse(JSON.stringify(obj)); // simple but effective for plain objects
    const result = cloneDeep(toObj);
    fields.forEach(field => {
        const fieldValue = Object.prototype.hasOwnProperty.call(fromObj, field) ? fromObj[field] : '';
        result[field] = fieldValue;
    });
    return result;
}
exports.getAdditionalProperties = getAdditionalProperties;
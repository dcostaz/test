'use strict';
const __root = require('app-root-path').path;
const path = require('path');
const Enums = require(path.join(__root, 'enums', 'mangalist.cjs'));

const fs = require('fs');

const { levenshteinEditDistance } = require('levenshtein-edit-distance');
const similarity = require('similarity');

const { Settings } = require('./cls/settings.cjs');
const { MangaUpdates } = require('./cls/mangaupdates.cjs');

const { getHakunekoList } = require(path.join(__root, 'utils', 'hakuneko.cjs'));

const { getDirectories, normalizeTitle, titleToSlug, wait } = require('./utils/tools.cjs');

const { getAdditionalProperties } = require('./utils/tools.cjs');

const template = require('string-placeholder');

const _ = require('lodash');

// Dry function to build readingItemObj
// Limits the structure to only the properties needed
// This matches the structure of a single item from temp.data.readinglist
// Single element from the results of https://api.mangaupdates.com/v1/lists/:id/search
// Example for single readingItem:
// "results": [
//     {
//         "record": {
//             "series": {
//                 "id": 27558584427,
//                 "url": "https://www.mangaupdates.com/series/cnro3u3/the-stellar-swordmaster",
//                 "title": "The Stellar Swordmaster"
//             },
//             "list_id": 0,
//             "status": {
//                 "volume": 1,
//                 "chapter": 6
//             },
//             "priority": 255,
//             "time_added": {
//                 "timestamp": 1751295165,
//                 "as_rfc3339": "2025-06-30T14:52:45+00:00",
//                 "as_string": "June 30th, 2025 2:52pm UTC"
//             }
//         },
//         "metadata": {
//             "series": {
//                 "bayesian_rating": 7.9,
//                 "latest_chapter": 81,
//                 "last_updated": {
//                     "timestamp": 1750905803,
//                     "as_rfc3339": "2025-06-26T02:43:23+00:00",
//                     "as_string": "June 26th, 2025 2:43am UTC"
//                 }
//             },
//             "user_rating": null
//         }
//     },
// ]
//
const buildReadingItemObj = (readingItem) => {
    if (typeof readingItem !== 'object' || readingItem === null || Object.keys(readingItem).length === 0) {
        return {};
    }
    return {
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
                latest_chapter: readingItem.metadata.series.latest_chapter
            },
            user_rating: readingItem.metadata.user_rating
        }
    }
};

// Dry function to build reviewItemObj
// Prepare, if available, the object with the selected option for serie in review
// {
//     title: title,
//     normalized: normalized,
//     directory: directory,
//     key: titleToSlug(directory),
// }
//
const buildReviewItemObj = (reviewItem) => {
    if (typeof reviewItem !== 'object' || reviewItem === null || Object.keys(reviewItem).length === 0) {
        return {};
    }
    return {
        titleMatch: reviewItem.titleMatch,
        title: reviewItem.title,
        normalized: reviewItem.normalized,
        directory: reviewItem.directory,
        key: reviewItem.key
    };
};

async function updateDirectories(settings, temp) {
    let success = false;

    // Check if settings exist
    if (!settings || !Object.keys(settings).length) {
        console.log('No settings were provided.');
        return success;
    }

    // Check if directoryPathName is defined
    if (!settings.managa || !settings.managa.directoryPathName) {
        console.log('No directory path name defined in settings.');
        return success;
    }

    const directories = await getDirectories(settings.manga.directoryPathName)
        //.then(dirs => console.log('Directories:', dirs))
        .catch(console.error);

    if (!directories || !directories.length) {
        console.log('Could not load manga directories from Local Storage.');
    }
    else {
        // write directories to temp database
        temp.data.directories = directories || [];
        temp.write();
        success = true;
        console.log('Directories updated successfully.');
    }

    return success;
}
exports.updateDirectories = updateDirectories;

async function getMangaUpdatesReadingList(temp) {
    // Check if temp data has readinglist
    if (!temp.data.hasOwnProperty('readinglist')) {
        console.log('Database does not have readinglist table.');
        return false;
    }

    const mangaUpdatesInstance = await MangaUpdates.init(await Settings.init());

    // Load manga updates reading list
    // 0 - Reading List
    // 1 - Wish List
    // 2 - Complete List
    // 3 - Unfinished List
    // 4 - On Hold List
    const mangaUpdatesListID = 0; // Selected Reading List

    // Call MangaUpdates API to get the reading list
    const mangaList = await mangaUpdatesInstance.getListSeries(mangaUpdatesListID);

    // Check if the reading list was loaded
    if (!mangaList || !mangaList.length) {
        console.log('Could not load manga updates reading list from MangaUpdates.');
        return false;
    }

    // Save the reading list to temp data
    temp.data.readinglist = mangaList;
    temp.write();

    // All good, we have the reading list
    return true
}
exports.getMangaUpdatesReadingList = getMangaUpdatesReadingList;

// Helper to fix mangaupdatesreadinglist keys
async function syncKeysWithDirectory(reviewList) {
    let updatedCount = 0;

    reviewList.forEach((entry) => {
        const expectedKey = titleToSlug(entry.directory);
        if (entry.key !== expectedKey) {
            console.log(`Updating key for: ${entry.title}`);
            console.log(`Old key: ${entry.key}`);
            console.log(`New key: ${expectedKey}`);
            entry.key = expectedKey;
            updatedCount++;
        }
    });

    if (updatedCount > 0) {
        console.log(`${updatedCount} key(s) updated.`);
        return true;

    } else {
        console.log("No keys needed updating.");
    }

    return false;
}

async function getReadingListSerieDetail(readingItems) {
    if (!readingItems) {
        console.log('Invalid parameters provided to addSerie function.');
        return { status: Enums.GET_READINGLIST_SERIEDETAIL_STATUS.ERROR, serieDetail: {}, serieReview: {} };
    }

    // 0) Prepare overall elements required to process the series
    //
    // Objects to be returned
    let serieDetail = {}; // This will hold the serie details if needed
    let serieReview = {}; // This will hold the review object if needed
    let status = Enums.GET_READINGLIST_SERIEDETAIL_STATUS.SUCCESS;

    // Prepare the readingItem object from readingItems
    const readingItem = buildReadingItemObj(readingItems.readingItem);

    // Prepare, if available, the object with the selected option for serie in review
    const reviewItem = buildReviewItemObj(readingItems.reviewItem);

    // Prepare the manga directories
    const directories = readingItems.directories;

    // Prepare a Set of lowercase and normalized directory names for fast lookup
    // Set(directories)
    const directoryLookUp = readingItems.directoryLookUp || new Set(directories.map(str => normalizeTitle(str).toLowerCase()));

    // Prepare list of series
    const readingList = readingItems.readingList;

    // Prepare list of series in review
    const reviewList = readingItems.reviewList;

    // Get the series title and normalize it
    let seriesTitle = readingItem.record.series.title;
    const normalizedSeriesTitle = normalizeTitle(seriesTitle).toLowerCase();

    // 1) Check if this series already exists in the DB
    const alreadyExists = readingList.some(
        obj => normalizeTitle(obj.title).toLowerCase() === normalizedSeriesTitle
    );
    if (alreadyExists) {
        // Return if already present
        return { status: Enums.GET_READINGLIST_SERIEDETAIL_STATUS.SKIPPED, serieDetail: {}, serieReview: {} };
    }

    // 2) If the serie is in review status, skip it
    //    This is to avoid reprcessing series that are already in review
    //    If reviewItem is provided, we are performing the revision
    // Check if the serie is already in review
    //
    const serieInReview = reviewList.find(obj => obj.id === readingItem.record.series.id);
    if ((serieInReview && serieInReview.length !== 0) && (Object.keys(reviewItem).length === 0)) {
        // Message for log
        const message = (id, title) => `*ID: ${id}, TITLE: ${title}, ALIAS: N/A, DIRECTORY: N/A (In review)`;
        console.log(message(readingItem.record.series.id, seriesTitle));

        // Return if the serie is already in review
        return { status: Enums.GET_READINGLIST_SERIEDETAIL_STATUS.IN_REVIEW, serieDetail: {}, serieReview: {} };
    }

    const mangaUpdatesInstance = await MangaUpdates.init(await Settings.init());

    // 3) Lookup MangaUpdates for full series details
    let serie = null;
    try {
        serie = await mangaUpdatesInstance.getSerieDetail(readingItem.record.series.id);

    } catch (error) {
        console.error(`Error getting series detail "${readingItem?.record?.series?.title || 'Unknown'}":`, error);

        // Return on error
        return { status: Enums.GET_READINGLIST_SERIEDETAIL_STATUS.FAILED_GET, serieDetail: {}, serieReview: {} };
    }

    // If no serie details were found in MangaUpdates, log the series and continue
    if (Object.keys(serie).length === 0) {
        // Message for log
        const message = (id, title) => `*ID: ${id}, TITLE: ${title}, ALIAS: N/A, DIRECTORY: N/A (No details found)`;
        console.log(message(readingItem.record.series.id, seriesTitle));

        // Return if no serie details found
        return { status: Enums.GET_READINGLIST_SERIEDETAIL_STATUS.NO_DETAILS, serieDetail: {}, serieReview: {} };
    }

    // Fields to be added to serieDetail from serie
    const fields = ['year', 'completed', 'type', 'status'];

    // Initialize variables for directory, key, alias, and title match type
    let key = ''; // Key must be empty until we find a match with a directory
    let directory = ''; // Directory will be assigned the matched directory
    let alias = ''; // Alias will be empty unless we find a match with an associated title
    let mangaupdatesTitleMatch = Enums.MANGAUPDATES_TITLE_MATCH.TITLE_NO_MATCH; // Default to no title match

    // Build associated titles array with normalized and slugged keys
    // This will be used to check for associated titles later
    // This will also be used to log the associated titles for review
    const associatedTitles = serie.associated.map(obj => buildReviewItemObj({
        title: obj.title,
        normalized: normalizeTitle(obj.title).toLowerCase(),
        directory: obj.title, // Use the title as directory assuming it is a direct match
        key: titleToSlug(obj.title) // Always use the directory as key to match Hakuneko key
    }));

    // Flag that indicates if its not a direct match, we will save it for review. Reset to false for each serie
    let pendingReviewMatch = false;

    // 3) Check for a direct directory match (exact or similar)
    let similarTitlesMatches = [];

    let matchSuccesfull = false;

    const normalizedReviewDirectory = normalizeTitle(reviewItem?.directory).toLowerCase();
    const matchTitle = normalizedReviewDirectory || normalizedSeriesTitle;
    if (directoryLookUp.has(matchTitle)) {
        // Try exact match first
        directory = directories.find(
            dir => normalizeTitle(dir).toLowerCase() === matchTitle
        );
        alias = reviewItem.directory ? reviewItem.directory : alias; // If reviewDirectory is provided, we are in review mode
        key = reviewItem.key ? reviewItem.key : titleToSlug(directory); // Always use the directory name as key to match Hakuneko key
        mangaupdatesTitleMatch = reviewItem.titleMatch ? reviewItem.titleMatch : Enums.MANGAUPDATES_TITLE_MATCH.TITLE_MATCH; // If reviewDirectory is provided, we are in review mode

        // Title match was successfull
        matchSuccesfull = true;

    } else {
        // Try similar match using Levenshtein and similarity
        const similarDir = directories.find(dir => {
            const normDir = normalizeTitle(dir).toLowerCase();
            return (
                levenshteinEditDistance(normDir, normalizedSeriesTitle) <= 10 &&
                similarity(normDir, normalizedSeriesTitle) >= 0.85
            );
        });
        if (similarDir) {
            // Set additional properties for review
            mangaupdatesTitleMatch = Enums.MANGAUPDATES_TITLE_MATCH.TITLE_SIMILAR;

            // Store the similar directory match for review
            const reviewItemObj = buildReviewItemObj({
                titleMatch: mangaupdatesTitleMatch,
                title: seriesTitle,
                normalized: normalizedSeriesTitle,
                directory: similarDir,
                key: titleToSlug(similarDir) // Always use the directory name as key to match Hakuneko key
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
                    const associateDirectory = directories.find(
                        dir => normalizeTitle(dir).toLowerCase() === match.normalized
                    );

                    // Set additional properties for review
                    mangaupdatesTitleMatch = Enums.MANGAUPDATES_TITLE_MATCH.ASSOCIATED_TITLE;

                    const reviewItemObj = buildReviewItemObj({
                        titleMatch: mangaupdatesTitleMatch,
                        title: match.title,
                        normalized: match.normalized,
                        directory: associateDirectory,
                        key: titleToSlug(associateDirectory) // Always use the directory name as key to match Hakuneko key
                    });
                    similarTitlesMatches.push(reviewItemObj);

                    pendingReviewMatch = true; // Possible associated title matches, needs review

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
                            levenshteinEditDistance(normalizeTitle(dir).toLowerCase(), fuzzyMatch.normalized) <= 20 &&
                            similarity(normalizeTitle(dir).toLowerCase(), fuzzyMatch.normalized) >= 0.7
                        );
                        if (matchedDir)
                            return buildReviewItemObj({
                                titleMatch: mangaupdatesTitleMatch,
                                title: fuzzyMatch.title,
                                normalized: fuzzyMatch.normalized,
                                directory: matchedDir,
                                key: titleToSlug(matchedDir)
                            });
                    });
                    similarTitlesMatches.push(...associatedTitlesMatches);

                    pendingReviewMatch = true; // Multiple possible matches, needs review

                } else {
                    if (!pendingReviewMatch) {
                        // No associated titles matched directoryLookUp
                        console.log(`No associated titles matched directoryLookUp for "${seriesTitle}".`);
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
        mangaupdatesTitleMatch
    };

    // Add additional fields from the MangaUpdates serie
    serieDetail = getAdditionalProperties(fields, serie, serieDetail);

    // 5) a) If no match found or multiple possibilities were found (no directory could be matched).
    //    b) If matched by similarity, the match will be forced to review.
    //    Skip this serie
    if (!matchSuccesfull || pendingReviewMatch) {
        // Build a plain object from a single readingItem:
        const readingItemObj = buildReadingItemObj(readingItem);

        // Build possibleDirectories with
        // Matches found for similar & associated titles
        const possibleDirectoriesReview = similarTitlesMatches;

        // Add key to associatedTitles if they have a match in possibleDirectories
        let associatedTitlesReview;
        if (similarTitlesMatches.length > 0) {
            const aT = associatedTitles.map(match => {
                // If match.title is in associatedTitles, add key
                const at = similarTitlesMatches.find(atm => atm.title === match.title);
                return at ? { title: match.title, key: match.key } : { title: match.title };
            });

            associatedTitlesReview = aT.map(at => { return at.key ? { title: at.title, key: at?.key } : { title: at.title }; });
        }

        // Unmatched entry for review (troubleshooting)
        serieReview = {
            id: readingItem.record.series.id,
            title: seriesTitle,
            normalizedTitle: normalizedSeriesTitle,
            associatedTitles: associatedTitlesReview, // Save associated titles for review
            possibleDirectories: possibleDirectoriesReview,
            matchedSerie: serieDetail,
            readingItem: readingItemObj, // Save the original readingItem for review
            timestamp: new Date().toISOString()
        };

        status = Enums.GET_READINGLIST_SERIEDETAIL_STATUS.FOR_REVIEW;

    }

    return { status, serieDetail, serieReview };

}
exports.getReadingListSerieDetail = getReadingListSerieDetail;

function simplifyAlphaOnly(text) {
    return text.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}

async function renameImageFilesToMatchKeys(db, imageDir) {
    const imageFiles = fs.readdirSync(imageDir).filter(f => f.endsWith('.jpg'));
    const simplifiedToFileMap = new Map();

    // Build simplified map of current image filenames
    imageFiles.forEach(file => {
        const slug = path.basename(file, '.jpg');
        const simplified = simplifyAlphaOnly(slug);
        simplifiedToFileMap.set(simplified, slug);
    });

    let renamedCount = 0;

    db.data.mangaupdatesreadinglist.forEach(entry => {
        const simplifiedKey = simplifyAlphaOnly(entry.key);

        if (simplifiedToFileMap.has(simplifiedKey)) {
            const oldSlug = simplifiedToFileMap.get(simplifiedKey);
            const oldPath = path.join(imageDir, `${oldSlug}.jpg`);
            const newPath = path.join(imageDir, `${entry.key}.jpg`);

            // Only rename if the name has actually changed
            if (oldSlug !== entry.key && !fs.existsSync(newPath)) {
                fs.renameSync(oldPath, newPath);
                console.log(`✅ Renamed: ${oldSlug}.jpg → ${entry.key}.jpg`);
                renamedCount++;
            }
        }
    });

    if (renamedCount === 0) return false;

    console.log(`\n✨ Total images renamed: ${renamedCount}`);
    return true;
}

async function addNewSeries(temp, db) {
    // Set to "false"; no writing to the database on completion
    let updated = false;

    // Let's track number of errors to take action after "n" errors
    const MAX_ERRORS = 2;
    let errorCount = 0;

    // Prepare a Set of normalized directory names for fast lookup
    const directoryLookUp = new Set(temp.data.directories.map(str => normalizeTitle(str).toLowerCase()));

    // Source "MangaUpdates" reading list
    const sourceReadingList = temp.data.readinglist;
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
    for (const readingItem of sourceReadingList) {
        const seriesTitle = readingItem?.record?.series?.title;

        const readingItems = {
            readingItem: readingItem, // Reading list item from MangaUpdates reading list
            reviewItem: {}, // Selected option for serie in review
            directories: temp.data.directories, // Manga directories
            directoryLookUp: directoryLookUp, // Lookup set for directories
            readingList: db.data.mangaupdatesreadinglist, // List of series
            reviewList: db.data.unmatchedfromreadinglist // List of series in review
        };

        // 1) Get the series details from the reading item
        const { status, serieDetail, serieReview } = await getReadingListSerieDetail(readingItems);

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
        if ((status === Enums.GET_READINGLIST_SERIEDETAIL_STATUS.FOR_REVIEW) && (Object.keys(serieReview).length !== 0)) {
            // Add the serie to the review database
            db.data.unmatchedfromreadinglist.push(serieReview);

            // Make sure we set the flag so we know we updated the database
            updated = true;

            // Message for log
            const message = (id, title) => `*ID: ${id}, TITLE: ${title}, ALIAS: N/A, DIRECTORY: N/A (Set for review)`;
            console.log(message(readingItem.record.series.id, seriesTitle));

            // Skip forward to the next serie
            continue;

        }

        // 3) If we have a directory, add the series to the database
        if ((status === Enums.GET_READINGLIST_SERIEDETAIL_STATUS.SUCCESS) && (Object.keys(serieDetail).length !== 0)) {
            // Add the serie to the database
            db.data.mangaupdatesreadinglist.push(serieDetail);

            // Remove entry from unmatchedfromreadinglist if found in the reading list database
            const idx = db.data.unmatchedfromreadinglist.findIndex(entry => entry.id === serieDetail.id);
            if (idx !== -1) {
                // Get the entry from unmatchedfromreadinglist
                const entry = db.data.unmatchedfromreadinglist[idx];
                if (db.data.mangaupdatesreadinglist.find(obj => obj.id === entry.readingItem.record.series.id)) {
                    db.data.unmatchedfromreadinglist.splice(idx, 1);
                }
            }

            // Set the flag so we know we updated the database.
            // This will be used to write the database only once at the end
            updated = true;

            // Message for log
            const message = (sd) => `+${sd.mangaupdatesTitleMatch} ID: ${sd.id}, TITLE: ${sd.title}, ALIAS: ${sd.alias}, DIRECTORY: ${sd.directory}`;
            console.log(message(serieDetail));

            await wait(1000); // Optional: throttle requests

        }
    }

    // If we have updated the database, write it.
    // This will ensure we only write once at the end of the loop
    if (updated) {
        await db.write();
        console.log('New series written to database.');

    } else {
        console.log('No new series added to the database.');

    }
}
exports.addNewSeries = addNewSeries;

async function syncUserRating(temp, db) {
    let modified = false;

    await temp.read();
    await db.read();

    for (const readingItem of temp.data.readinglist) {
        const seriesID = readingItem.record.series.id;
        const serieDetail = db.data.mangaupdatesreadinglist.find(obj => obj.id == seriesID);

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
exports.syncUserRating = syncUserRating;

// Dry function to build serieDetailObj
// Prepare, if available, the object with the selected option for serie detail
//
const serieDetailObj = (serialDetail) => {
    if (typeof serialDetail !== 'object' || serialDetail === null || Object.keys(serialDetail).length === 0 || !serialDetail.key)
        return {};

    return {
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
        year: serialDetail?.year || '',
        completed: serialDetail?.completed || false,
        type: serialDetail?.type || '',
        status: serialDetail?.status || ''
    };
};

// Update the Hakuneko list in the database and return the Hakuneko list merged with MangaUpdates reading list
// MangaUpdates reading list --> Hakuneko list (matched + unmatched) --> Hakuneko database
async function rebuildHakunekoList(temp, db) {
    const hakuneko = await getHakunekoList(db);

    if (!hakuneko || !Object.keys(hakuneko).length) {
        console.log('Could not load Hakuneko reading list.');

        return;
    }

    const merged = db.data.mangaupdatesreadinglist.filter(manga => hakuneko[manga.key]) // 🔍 only keep matching series
        .map(manga => {
            // For debugging
            if (manga.key === "1st-year-max-level-manager")
                console.log('found!');

            // Hidrate serieDetail object with existing values in hakuneko entry
            let serieDetail = serieDetailObj(manga);

            // Fields to be added to serieDetail from serie
            /** @type {additionalPropertiesFields} - Fields to be used for getAdditionalPrpoerties. */
            const hakunekoFields = ['hkey', 'hmanga', 'hconnector', 'hconnectorDescription', 'hfolder',
                'himageAvailable', 'hlastchapter', 'hchapter', 'hlastModified'];

            // Hidrate serieDetail with data from the hakuneko entry referenced by managa.key for the fields specified in hakunekoFields
            // The result pass back to serieDetail
            serieDetail = getAdditionalProperties(hakunekoFields, hakuneko[manga.key], serieDetail);

            // Is hchapter empty?
            // Values considered empty are undefined, null, empty string, 0, or NaN
            // MangaUpdates does not accept 0 either as the chapter value
            const hchapterEmpty = (
                serieDetail.hchapter === undefined || 
                serieDetail.hchapter === null || 
                serieDetail.hchapter === '' || 
                serieDetail.hchapter === 0 || 
                isNaN(serieDetail.hchapter)
            );

            // When comparing hchapter with chapter, we need to ensure that the chapter is a integer (MagaUpdates does not support floating point chapters)
            const chapterMatches = (hchapterEmpty && (serieDetail.chapter === 1)) || (Math.floor(serieDetail.hchapter) === Math.floor(serieDetail.chapter));

            // Ensure serieDetail.chapter is updated to match manga.chapter
            // Don't update if chapter counts match
            if (!chapterMatches) {
                // If hchapter is empty, and chapter is not 1, set chapter to 1
                if (hchapterEmpty && (serieDetail.chapter !== 1))
                    serieDetail.chapter = 1;

                // Assign hakuneko chapter "hchapter" which has the chapter count from the series reader
                else
                    serieDetail.chapter = Math.floor(serieDetail.hchapter); // ensure that the chapter is a integer (MagaUpdates does not support floating point chapters)

            }

            return serieDetail;

        });

    // Build mapping index to match chapter marks to the book marks
    const mangaKeys = new Set(merged.map(manga => manga.key));

    // Build new object with all hakuneko entries that were not matched with mangaupdatesreadinglist
    const unmatched = Object.fromEntries(Object.entries(hakuneko).filter(([key]) => !mangaKeys.has(key)));

    let mergedRest = Object.entries(unmatched).map(([key, serie]) => {
        // Fields to be added to serieDetail from serie
        /** @type {additionalPropertiesFields} - Fields to be used for getAdditionalPrpoerties. */
        const seriesFields = ['id', 'title', 'url', 'chapter', 'volume', 'userRating', 'lastChapter', 'associatedTitles',
            'directory', 'alias', 'mangaupdatesTitleMatch', 'year', 'completed', 'type', 'status'];

        let serieDetail = serieDetailObj({ key: key });

        // If the hakuneko entry has a directory assigned, override with the series properties from the hakuneko entry
        if (serie.directory !== "")
            // Hidrate serieDetail with hakuneko entry data for the specified fields
            serieDetail = getAdditionalProperties(seriesFields, serie, serieDetail);

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
    });

    const mergeAll = _.merge({}, merged.concat(mergedRest));

    // If the merged list was updated, write it to the database
    if (mergeAll) {
        db.data.hakuneko = mergeAll;
        await db.write();

        console.log('Updated Hakuneko list in database.');
    }
    else {
        console.log('Could not update Hakuneko list.');
    }

    await temp.read();

    const searchSerieTemplate = '{"search": "${serieTitle}", "stype": "title", "page": 1, "perpage": 25, "pending": false, "include_rank_metadata": false, "exclude_filtered_genres": false}';

    // Sort changes our { key: object, } --> [ [key, value], ]
    const sortedUnmatched = Object.entries(mergedRest).sort((a, b) => {
        const titleA = (a[1].hmanga || '').toLowerCase();
        const titleB = (b[1].hmanga || '').toLowerCase();
        return titleA.localeCompare(titleB);
    });

    let searchSeries = [];
    sortedUnmatched.forEach(([key, value]) => {
        if (value.directory !== "") return

        const searchTitle = template(searchSerieTemplate, { serieTitle: value.hmanga });
        searchSeries.push(searchTitle);
    });

    let counter = 0;
    let seriesToAddToList = [];

    db.data.last = [];
    for (let i = 0; i < searchSeries.length; i++) {
        /** @type {string} */
        const searchTitle = JSON.stringify([searchSeries[i]]);

        const mangaUpdatesInstance = await MangaUpdates.init(await Settings.init());

        /** @type {MangaUpdatesSearchSeriesResultEntry[]} */
        const search = await mangaUpdatesInstance.serieSearch(JSON.parse(searchTitle));

        const availableSeries = search.filter(item => String(item.hit_title) === String(JSON.parse(searchTitle).search));

        // Calculate the current block number
        const block = Math.floor(counter / 25);

        const listEntryTemplate = '{"series":{"id":${serieID},"title":"${serieTitle}"},"list_id":0}';
        if (Object.values(availableSeries).length === 0) continue;

        const foundSerie = availableSeries[0];

        if (temp.data.readinglist.findIndex(rd => rd.record.series.id == foundSerie.record.series_id) !== -1) continue;

        const listEntry = template(listEntryTemplate, {
            serieID: foundSerie.record.series_id,
            serieTitle: foundSerie.record.title,
        });

        // Initialize the subarray if it doesn't exist
        if (!seriesToAddToList[block] || !Array.isArray(seriesToAddToList[block]))
            seriesToAddToList[block] = [];

        try {
            // Add the change to the list
            seriesToAddToList[block].push(JSON.parse(listEntry));

            db.data.last.push(`ID: ${foundSerie.record.series_id}, Title: ${foundSerie.hit_title}, Payload: ${listEntry}`);
        }
        catch (error) {
            console.log(`ID: ${foundSerie.record.series_id}, Title: ${searchTitle}, Payload: ${listEntry}`);

             db.data.last.push(`ID: ${foundSerie.record.series_id}, Title: ${searchTitle}, Payload: ${listEntry}`);
        }
        //console.log(JSON.stringify(availableSeries));

        // Increment the counter
        counter++;

        await db.write();

        await wait(1000);

    }

    const mangaUpdatesInstance = await MangaUpdates.init(await Settings.init());

    if (seriesToAddToList.length) {
        db.data.last = [];
        // Get detail from manga updates
        for (let i = 0; i < seriesToAddToList.length; i++) {
            const addToListResults = await mangaUpdatesInstance.addListSeries(seriesToAddToList[i]);

            if (addToListResults) {
                db.data.last.push(addToListResults);
                db.write();
                const series = seriesToAddToList[i].length;
                console.log(`Updated ${series} series for block ${i + 1} of ${seriesToAddToList.length}.`);
            }

            await wait(5000);

        }

    }

    return;
}
exports.rebuildHakunekoList = rebuildHakunekoList;

async function sendHakunekoChapterUpdatesToMangaUpdates(db) {
    let skipall = false; // Use for debugging. Forces logic to skip all remaining entries if set
    let listsSeriesUpdates = [];
    let seriesChange;
    let counter = 0;

    // Dry function to build a series change object
    // The change object represents the Manga Updates reading list update object
    const buildListSerie = (sd) => `{"series":{"id":${sd.seriesID}},"list_id": ${sd.listID},"status": {"chapter": ${sd.newChapter}}}`;

    // Build the Manga Updates reading list update object on a 100 series block basis
    Object.entries(db.data.hakuneko).forEach(([key, value]) => {
        // If the series has a Manga Updates series ID, skip
        if (!value.id || skipall) return

        // Is hchapter empty?
        const hchapterEmpty = (value.hchapter === undefined || value.hchapter === null || value.hchapter === '' || value.hchapter === 0 || isNaN(value.hchapter));

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
            listsSeriesUpdates[block] = [];

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

    const mangaUpdatesInstance = await MangaUpdates.init(await Settings.init());

    if (listsSeriesUpdates.length && !skipall) {
        db.data.last = [];
        // Get detail from manga updates
        for (let i = 0; i < listsSeriesUpdates.length; i++) {
            let updatesResults = await mangaUpdatesInstance.updateListSeries(listsSeriesUpdates[i]);

            if (updatesResults) {
                db.data.last.push(updatesResults);
                db.write();

                const series = listsSeriesUpdates[i].length;

                console.log(`Updated ${series} series for block ${i + 1} of ${listsSeriesUpdates.length}.`);
            }
        }

    }
}
exports.sendHakunekoChapterUpdatesToMangaUpdates = sendHakunekoChapterUpdatesToMangaUpdates;
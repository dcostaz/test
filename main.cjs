'use strict';
const __root = require('app-root-path').path;
const path = require('path');
const Enums = require(path.join(__root, 'enums', 'mangalist.cjs'));

const { app, BrowserWindow, ipcMain, screen } = require('electron');
const { setupIpcEvents } = require('./setupIpc.cjs');

const fsExists = require('fs').existsSync; // Use existsSync for synchronous check

const redis = require('redis');

/** @type {MangaConstructor} - Manga Class. */
const Manga = require(path.join(__root, 'cls', 'manga.cjs'));

/** @type {MangaClass} - Holds reference to a Manga instance. */
let manga = Object.create(null);

/** @type {BrowserWindow} */
let mainWindow;

/** @type {BrowserWindow} */
let reviewWin;

const preloadPath = path.join(__dirname, 'preload.cjs');
if (!fsExists(preloadPath)) {
    console.error('Preload script not found:', preloadPath);
}

const createWindow = () => {
    try {
        mainWindow = new BrowserWindow({
            width: 3000,
            height: 1300,
            title: 'Manga List',
            icon: path.join(__dirname, 'icon.png'),
            webPreferences: {
                preload: preloadPath,
                nodeIntegration: true
            }
        });

        const mainHTML = path.join(__dirname, 'index.html');
        if (!fsExists(mainHTML)) {
            console.error('Main HTML file not found:', mainHTML);
            return;
        }

        mainWindow.loadFile(mainHTML);
    } catch (e) {
        console.error('Error loading window:', e);
    }

    try {
        mainWindow.webContents.debugger.removeAllListeners('Autofill.enable');
    } catch (error) {
        console.warn('Diable Autofill.enable command failed:', error);
    }

    try {
        mainWindow.webContents.debugger.removeAllListeners('Autofill.setAddresses');
    } catch (error) {
        console.warn('Disable Autofill.setAddresses command failed:', error);
    }
}

function openReviewWindow() {
    try {
        reviewWin = new BrowserWindow({
            width: 900,
            height: 700,
            title: 'Review Unmatched Series',
            webPreferences: {
                preload: preloadPath,
                nodeIntegration: true
            }
        });

        //reviewWin.setMenu(null); // This removes the menu
        reviewWin.loadFile('review.html');

        reviewWin.on('closed', () => {
            // Notify main window that second window is closed
            mainWindow.webContents.send('sync-reading-list-done');
        });

    } catch (e) {
        console.error('Error loading window:', e);
    }

    try {
        reviewWin.webContents.debugger.removeAllListeners('Autofill.enable');
    } catch (error) {
        console.warn('Diable Autofill.enable command failed:', error);
    }

    try {
        reviewWin.webContents.debugger.removeAllListeners('Autofill.setAddresses');
    } catch (error) {
        console.warn('Disable Autofill.setAddresses command failed:', error);
    }
}

const { globalShortcut } = require('electron');

function toggleDevTools() {
    const win = BrowserWindow.getFocusedWindow();
    if (win) win.webContents.toggleDevTools();
}

app.on('ready', async () => {
    globalShortcut.register('CommandOrControl+Shift+I', toggleDevTools);
    globalShortcut.register('F12', toggleDevTools);

    try {
        manga = await Manga.init();
    } catch (error) {
        console.error('Failed to load manga instance. Error: ', error);
        app.quit();
    };

    // Setup Ipc Handling
    setupIpcEvents(manga);

    createWindow();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

app.on('quit', async () => {
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
})

ipcMain.on('toggle-dev-tools', (event) => {
    toggleDevTools()
});

ipcMain.on('open-review-window', (event) => {
    try {
        openReviewWindow();
        console.log('[open-review-window] Review window opened');
        event.sender.send('open-review-window-done');
    } catch (error) {
        console.error('[open-review-window] Error:', error);
        event.sender.send('open-review-window-failed');
    }
});

const fs = require('fs').promises;
const JSZip = require('jszip');

/** @type {BrowserWindow|null} */
let cbzViewerWindow;

/** @type {mangaHakuneko|null} */
let currentViewerRecord;

/**
 * Gets a list of chapter files for a given manga record.
 * @param {mangaHakuneko} record - The manga record.
 * @returns {Promise<string[]>} A promise that resolves with a sorted list of chapter filenames.
 */
async function getChapterList(record) {
    try {
        const mangaFolderPath = path.join(manga.path, record.hfolder);
        const files = await fs.readdir(mangaFolderPath);
        const cbzFiles = files.filter(file => path.extname(file).toLowerCase() === '.cbz');

        if (cbzFiles.length === 0) {
            console.error(`No .cbz files found in directory: ${mangaFolderPath}`);
            return [];
        }

        // Sort files descending to get the chapters in order
        cbzFiles.sort((a, b) => b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' }));

        return cbzFiles;
    } catch (dirError) {
        console.error(`Failed to read directory for chapters: ${dirError}`);
        return [];
    }
}

/**
 * Gets the data for a specific chapter.
 * @param {mangaHakuneko} record - The manga record.
 * @param {string} chapterFileName - The filename of the chapter to load.
 * @returns {Promise<{images: string[], chapter: string} | null>}
 */
async function getChapterData(record, chapterFileName) {
    let cbzPath = path.join(manga.path, record.hfolder, chapterFileName);

    try {
        const data = await fs.readFile(cbzPath);
        const zip = await JSZip.loadAsync(data);
        const imagePromises = [];
        const sortedFiles = Object.keys(zip.files).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

        for (const fileName of sortedFiles) {
            const file = zip.files[fileName];
            if (!file.dir && /\.(jpg|jpeg|png|gif|webp)$/i.test(fileName)) {
                const promise = file.async('base64').then(base64 => {
                    const extension = path.extname(fileName).substring(1);
                    return `data:image/${extension};base64,${base64}`;
                });
                imagePromises.push(promise);
            }
        }

        const images = await Promise.all(imagePromises);

        return {
            images: images,
            chapter: chapterFileName
        };

    } catch (error) {
        console.error(`Failed to open or process CBZ file at ${cbzPath}:`, error);
        return null;
    }
}

/**
 * Loads a specific chapter and sends the images to the viewer window.
 * @param {mangaHakuneko} record - The manga record.
 * @param {string} chapterFileName - The filename of the chapter to load.
 * @param {boolean} isInitial - Whether this is the initial load.
 * @returns {Promise<boolean>}
 */
async function loadChapter(record, chapterFileName, isInitial = false) {
    const chapterData = await getChapterData(record, chapterFileName);
    const chapterList = await getChapterList(record);
    const currentIndex = chapterList.indexOf(chapterFileName);

    if (chapterData && cbzViewerWindow) {
        let chapterNumber = '';
        const match = chapterFileName.match(/(\d+(\.\d+)?)/);
        if (match) {
            chapterNumber = match[0];
        }
        cbzViewerWindow.setTitle(`CBZ Viewer - Chapter ${chapterNumber}`);

        const payload = {
            ...chapterData,
            currentIndex: currentIndex,
            chapterList: chapterList,
        };

        const channel = isInitial ? 'initial-chapter-data' : 'chapter-loaded';
        cbzViewerWindow.webContents.send(channel, payload);

        // Update hchapter in manga database only if not initial load and record exists
        if ((!isInitial && record) || (record.hchapter === null)) {
            await manga.updateMangaChapter(record.key, parseFloat(chapterNumber));
            record.hchapter = parseFloat(chapterNumber);
        }

        return true;
    }
    return false;
}

/**
 * Opens the CBZ viewer window.
 */
function openCbzViewer() {
    if (cbzViewerWindow && !cbzViewerWindow.isDestroyed()) {
        cbzViewerWindow.focus();
        return;
    }

    const primaryDisplay = screen.getPrimaryDisplay();
    const { height } = primaryDisplay.workAreaSize;

    cbzViewerWindow = new BrowserWindow({
        width: 800,
        height: height,
        title: 'CBZ Viewer',
        webPreferences: {
            preload: path.join(__dirname, 'viewer-preload.cjs'),
            nodeIntegration: true
        }
    });

    cbzViewerWindow.setMenu(null); // This removes the menu
    cbzViewerWindow.loadFile('viewer.html');

    cbzViewerWindow.on('closed', () => {
        // Notify main window that viewer window is closed
        if (currentViewerRecord) {
            mainWindow.webContents.send('cbz-viewer-closed', currentViewerRecord.key, currentViewerRecord.hchapter);
        }

        // Clean up references
        cbzViewerWindow = null;
        currentViewerRecord = null;
    });
}

ipcMain.handle('open-cbz-viewer', (event, record) => {
    currentViewerRecord = record;
    openCbzViewer();
});

ipcMain.handle('get-initial-chapter', async (event) => {
    const record = currentViewerRecord;
    if (!record) return;

    const chapterList = await getChapterList(record);
    if (chapterList.length === 0) {
        // TODO: Send error message to viewer
        return;
    }

    let selectedChapter;
    // 1. Try to find hchapter
    if (record.hchapter) {
        const found = chapterList.find(name => {
            const match = name.match(/(\d+(\.\d+)?)/);
            return match && parseFloat(match[0]) === record.hchapter;
        });
        if (found) {
            selectedChapter = found;
        }
    }

    // 2. If not found, try Chapter 1
    if (!selectedChapter) {
        const chapter1File = 'Chapter 1.cbz';
        if (chapterList.includes(chapter1File)) {
            selectedChapter = chapter1File;
        }
    }

    // 3. If still not found, take the first chapter
    if (!selectedChapter) {
        selectedChapter = chapterList[0];
    }

    await loadChapter(record, selectedChapter, true);
});

ipcMain.handle('get-chapter', async (event, chapterIndex) => {
    const record = currentViewerRecord;
    if (!record) return;

    const chapterList = await getChapterList(record);
    if (chapterList.length > chapterIndex && chapterIndex >= 0) {
        const chapterFileName = chapterList[chapterIndex];
        await loadChapter(record, chapterFileName);
    }
});

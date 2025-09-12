'use strict';
const __root = require('app-root-path').path;
const path = require('path');
const Enums = require(path.join(__root, 'enums', 'mangalist.cjs'));

const { app, BrowserWindow, ipcMain } = require('electron');
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
                nodeIntegration: false,
                contextIsolation: true
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
                nodeIntegration: false,
                contextIsolation: true
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

app.whenReady().then(() => {
    globalShortcut.register('CommandOrControl+Shift+I', toggleDevTools);
    globalShortcut.register('F12', toggleDevTools);
});

app.on('ready', async () => {
    try {
        manga = await Manga.init();
    } catch (error) {
        console.error('Failed to load manga instance. Error: ', error);
        app.quit();
    };

    // Setup Ipc Handling
    setupIpcEvents(manga);

    /*
    const mangalistSettings = manga.settings.mangalist;

    if (!mangalistSettings) {
        console.error('Failed to initialize MangaList.');
        app.quit();
        return; // Exit if initialization fails
    }

        await manga.updateDirectories([]);
    
        //await mangalist.refreshReadingList();
    
        const changed = await manga.getModifiedDirectories();
    
        const settings = manga.settings.mangalist;
    
        const set = manga.settings;
    
        const dir = manga.mangaDirectories();
    
        await manga.updateDirectories(changed);
    
        //const mangapath = await mangalist.manga.path();
    
        //const direc = mangalist.manga.directories;
    
        app.quit();
    
    
        // Load the data and directories
        if (!await init())
            app.quit();
    
        // Load manga updates reading list
        if (!await getMangaUpdatesReadingList(temp))
            app.quit();
    
        await addNewSeries(temp, db);
    
        // Exit if no Manga series are found
        if (!db.data.mangaupdatesreadinglist || !db.data.mangaupdatesreadinglist.length) {
            console.log('Could not load manga series.');
            app.quit();
        }
    
        await syncUserRating(temp, db);
    
        await rebuildHakunekoList(temp, db);
    
        await sendHakunekoChapterUpdatesToMangaUpdates(db);
    */
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

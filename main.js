const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1000,
        height: 800,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
    });

    mainWindow.loadFile('index.html');
    mainWindow.on('closed', () => (mainWindow = null));
}

app.on('ready', createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (mainWindow === null) createWindow();
});

// Handle file dialog
ipcMain.on('open-file-dialog', (event) => {
    dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [{ name: 'BAT Files', extensions: ['bat'] }],
    }).then((result) => {
        if (!result.canceled) {
            event.reply('selected-file', result.filePaths[0]);
        }
    });
});

// Handle saving console output
ipcMain.on('save-console-output', (event, output) => {
    dialog.showSaveDialog({
        title: 'Save Console Output',
        defaultPath: 'console-output.txt',
        filters: [{ name: 'Text Files', extensions: ['txt'] }],
    }).then((result) => {
        if (!result.canceled && result.filePath) {
            fs.writeFile(result.filePath, output, (err) => {
                if (err) {
                    event.reply('save-console-output-error');
                    return;
                }
                event.reply('save-console-output-success');
            });
        }
    });
});
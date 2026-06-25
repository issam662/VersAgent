import { ipcMain, BrowserWindow } from 'electron';

let cachedSystemInfo: any = null;
let mainWindow: BrowserWindow | null = null;

export function setMainWindow(win: BrowserWindow) {
    mainWindow = win;
}

export function updateSystemInfoCache(info: any, emitEvent: boolean = true) {
    cachedSystemInfo = info;
    if (emitEvent && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('system-info-updated', info);
    }
}

export function getCachedSystemInfo() {
    return cachedSystemInfo;
}

export function invalidateNetworkCache() {
    if (cachedSystemInfo) {
        cachedSystemInfo.vlanId = '';
        cachedSystemInfo.switchPort = '';
        updateSystemInfoCache(cachedSystemInfo);
    }
}

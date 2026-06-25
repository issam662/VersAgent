import { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, nativeImage, screen, powerSaveBlocker } from 'electron';
import path from 'path';
import { loadConfig, getConfig } from './config';
import { getSystemInfo, SystemInfo, getNetworkInterfaces, clearVlanCache } from './services/system-info';
import { getInstalledApps } from './services/installed-apps';
import { startBackgroundServices, stopBackgroundServices, fetchInfoPage, fetchMetadata, updateMetadata, AgentEvents, setLocalUnblock } from './services/api-client';
import { setMainWindow, updateSystemInfoCache, getCachedSystemInfo } from './services/cache';
import fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { logToAgent } from './services/logger';
import koffi from 'koffi';

const execAsync = promisify(exec);

// ── Koffi Native Win32 Integration ──────────────────────────────────────────
const user32 = koffi.load('user32.dll');
const kernel32 = koffi.load('kernel32.dll');

const GetForegroundWindow = user32.func('void* __stdcall GetForegroundWindow()');
const GetWindowThreadProcessId = user32.func('uint32_t __stdcall GetWindowThreadProcessId(void* hWnd, uint32_t* lpdwProcessId)');
const GetCurrentThreadId = kernel32.func('uint32_t __stdcall GetCurrentThreadId()');
const AttachThreadInput = user32.func('bool __stdcall AttachThreadInput(uint32_t idAttach, uint32_t idAttachTo, bool fAttach)');
const SetForegroundWindow = user32.func('bool __stdcall SetForegroundWindow(void* hWnd)');
const BringWindowToTop = user32.func('bool __stdcall BringWindowToTop(void* hWnd)');
const SetFocus = user32.func('void* __stdcall SetFocus(void* hWnd)');

// Set process name to be less conspicuous
app.setName('VersAgent');

// v1.1.5 FIX: Disable hardware acceleration to prevent black screen when running elevated.
// The scheduled task runs with HighestAvailable, which causes a GPU sandbox security context
// mismatch — the compositor silently fails producing a blank/black window.
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('no-sandbox');

let tray: Tray | null = null;
let popupWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;
let lockWindows: BrowserWindow[] = [];
let cachedInfoPage: any = null;
let overlaySettings: { enabled: boolean; tanium: boolean; crowdstrike: boolean; mcafee: boolean; keepAwake: boolean } = {
    enabled: false, tanium: false, crowdstrike: false, mcafee: false, keepAwake: false
};
let powerSaveId: number | null = null;
let overlayCheckInterval: NodeJS.Timeout | null = null;

// ── Scanner Variables ──
let captureWindow: BrowserWindow | null = null;
let previousHwnd: any = null; // To remember what to focus back to after 10s
const DATA_FILE = path.join(app.getPath('userData'), 'scanner_rules.json');

const SYSTEM_RULES = [
  { text: 'SYS_RES',  action: 'system-restart',  path: 'System Force Restart',  locked: true },
  { text: 'SYS_DWN', action: 'system-shutdown', path: 'System Force Shutdown', locked: true }
];

function loadRules() {
  if (fs.existsSync(DATA_FILE)) {
    try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')); } catch(e) {}
  }
  return [
    { text: 'ALS_FCS', action: 'focus', path: 'C:\\Program Files (x86)\\ALS Software\\Packaging.exe' },
    { text: 'ALS_RES', action: 'restart', path: 'C:\\Program Files (x86)\\ALS Software\\Packaging.exe' }
  ];
}

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        // Reload config to pick up new setup-config.json
        console.log('[AGENT] Second instance detected. Reloading config...');
        loadConfig();
        const { registerAgent, syncMetadataFast } = require('./services/api-client');
        syncMetadataFast(); // v1.0.57: Trigger immediate sync on reload
        registerAgent();

        if (popupWindow) {
            if (popupWindow.isMinimized()) popupWindow.restore();
            popupWindow.show();
            popupWindow.focus();
        } else {
            createPopupWindow();
        }
    });
}

function getResourcePath(filename: string): string {
    if (app.isPackaged) {
        return path.join(process.resourcesPath, 'renderer', filename);
    }
    return path.join(__dirname, '..', 'src', 'renderer', filename);
}

function createPopupWindow(): void {
    if (popupWindow) {
        popupWindow.show();
        popupWindow.focus();
        return;
    }

    popupWindow = new BrowserWindow({
        width: 800,
        height: 600,
        show: false,
        frame: false,
        resizable: true,
        skipTaskbar: true,
        alwaysOnTop: true,
        transparent: false,
        backgroundColor: '#1a1a2e',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    popupWindow.loadFile(getResourcePath('index.html'));
    setMainWindow(popupWindow);

    popupWindow.webContents.on('did-fail-load', (e, code, desc, url) => {
        console.error(`[AGENT] Load fail: ${code} ${desc} - URL: ${url}`);
        logToAgent('MAIN', `Load fail: ${code} ${desc} - URL: ${url}`);
    });

    popupWindow.once('ready-to-show', () => {
        popupWindow?.show();
        popupWindow?.focus();
    });

    // v1.0.80: Strict Authentication Lock
    // Wipe auth state on any window change
    popupWindow.on('minimize', () => popupWindow?.webContents.send('lock-ui'));
    popupWindow.on('hide', () => popupWindow?.webContents.send('lock-ui'));
    popupWindow.on('restore', () => popupWindow?.webContents.send('lock-ui'));
    popupWindow.on('show', () => popupWindow?.webContents.send('lock-ui'));

    popupWindow.on('blur', () => {
        // Don't auto-hide, let user close manually
    });

    popupWindow.on('closed', () => {
        popupWindow = null;
    });
}

function createCaptureWindow(): void {
    captureWindow = new BrowserWindow({
      width: 1,
      height: 1,
      x: -10000,
      y: -10000,
      frame: false,
      show: false,
      transparent: true,
      opacity: 0,
      skipTaskbar: true,
      focusable: true,
      alwaysOnTop: true,
      resizable: false,
      type: 'toolbar',
      webPreferences: {
        contextIsolation: false,
        nodeIntegration: true
      }
    });

    captureWindow.loadFile(getResourcePath('capture.html'));
    captureWindow.setAlwaysOnTop(true, 'screen-saver');

    captureWindow.webContents.on('did-finish-load', () => {
      captureWindow?.showInactive();
      console.log('[CAPTURE] Invisible capture window ready.');
    });

    captureWindow.on('close', (e) => {
      e.preventDefault();
    });
}

function createLockWindow(): void {
    if (lockWindows.length > 0) return;

    const displays = screen.getAllDisplays();

    displays.forEach((display) => {
        const isPrimary = display.id === screen.getPrimaryDisplay().id;

        const win = new BrowserWindow({
            x: display.bounds.x,
            y: display.bounds.y,
            width: display.bounds.width,
            height: display.bounds.height,
            frame: false,
            show: false, // Don't show until bounds are set
            skipTaskbar: true,
            enableLargerThanScreen: true,
            backgroundColor: '#ef4444', // Red background
            webPreferences: {
                preload: path.join(__dirname, 'preload.js'),
                contextIsolation: true,
                nodeIntegration: false,
            }
        });

        // Strictly enforce bounds on the specific monitor
        win.setBounds(display.bounds);
        
        if (isPrimary) {
            win.setKiosk(true);
        } else {
            win.setFullScreen(true);
        }

        // Force it to be above almost everything
        win.setAlwaysOnTop(true, 'screen-saver');
        win.show();

        // Prevent closing
        win.on('close', (e) => {
            const config = getConfig();
            if (config.isBlocked && lockWindows.includes(win)) {
                e.preventDefault();
            }
        });

        // Aggressive focus stealing (only primary needs active focus for password)
        win.on('blur', () => {
            const config = getConfig();
            if (config.isBlocked && lockWindows.includes(win) && isPrimary) {
                win.focus();
            }
        });

        // Load the lock UI
        win.loadFile(getResourcePath('index.html'));
        
        // Tell the renderer to show the lock UI once loaded
        win.webContents.on('did-finish-load', () => {
            const config = getConfig();
            win.webContents.send('show-lock-screen', { isPrimary, reason: config.blockReason });
        });

        lockWindows.push(win);
    });
}

function togglePopup(): void {
    if (popupWindow && popupWindow.isVisible()) {
        popupWindow.hide();
    } else {
        createPopupWindow();
    }
}

function createTray(): void {
    // v1.1.13: Load the new shield logo and resize for system tray
    const iconPath = app.isPackaged
        ? path.join(process.resourcesPath, 'renderer', 'icon.png')
        : path.join(__dirname, '..', 'assets', 'icon.png');

    let trayIcon: Electron.NativeImage;
    try {
        console.log('[AGENT] Loading tray icon from:', iconPath);
        trayIcon = nativeImage.createFromPath(iconPath);
        // Resize to standard tray icon size (16x16)
        if (!trayIcon.isEmpty()) {
            trayIcon = trayIcon.resize({ width: 16, height: 16 });
            console.log('[AGENT] Tray icon loaded and resized successfully.');
        }
    } catch (e) {
        console.error('[AGENT] Failed to load tray icon:', e);
        trayIcon = nativeImage.createEmpty();
    }

    tray = new Tray(trayIcon.isEmpty() ? createFallbackIcon() : trayIcon);
    tray.setToolTip('VersAgent');

    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Show Info (Ctrl+Alt+O)',
            click: togglePopup,
        },
        { type: 'separator' },
        {
            label: `v${getConfig().version}`,
            enabled: false,
        },
    ]);

    tray.setContextMenu(contextMenu);
    tray.on('double-click', togglePopup);
}

function createFallbackIcon(): Electron.NativeImage {
    // Create a 16x16 orange dot as fallback icon
    const size = 16;
    const canvas = Buffer.alloc(size * size * 4);
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const idx = (y * size + x) * 4;
            const dx = x - size / 2, dy = y - size / 2;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < size / 2 - 1) {
                canvas[idx] = 255;     // R
                canvas[idx + 1] = 107; // G
                canvas[idx + 2] = 0;   // B
                canvas[idx + 3] = 255; // A
            } else {
                canvas[idx + 3] = 0; // transparent
            }
        }
    }
    return nativeImage.createFromBuffer(canvas, { width: size, height: size });
}

function setupAutoStart(): void {
    // v1.0.89 FIX: We no longer use Electron's built-in registry run key because standard users
    // can disable it via Task Manager's Startup tab.
    // Ensure we actively REMOVE the legacy run key if it exists on updated machines.
    // The new startup mechanism is an elevated Scheduled Task created by the NSIS installer.
    app.setLoginItemSettings({
        openAtLogin: false,
        name: 'VersAgent'
    });
}

// v1.0.88: Overlay settings persistence
function getOverlaySettingsPath(): string {
    const userDataPath = app?.getPath?.('userData') || path.join(process.env.APPDATA || '', 'VersAgent');
    return path.join(userDataPath, 'overlay-settings.json');
}

function loadOverlaySettings(): void {
    try {
        const settingsPath = getOverlaySettingsPath();
        if (fs.existsSync(settingsPath)) {
            const saved = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
            overlaySettings = { ...overlaySettings, ...saved };
        }
    } catch (e) {
        console.error('[AGENT] Failed to load overlay settings:', e);
    } finally {
        updateKeepAwake();
    }
}

function saveOverlaySettings(): void {
    try {
        const settingsPath = getOverlaySettingsPath();
        const dir = path.dirname(settingsPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(settingsPath, JSON.stringify(overlaySettings, null, 2));

        // v1.0.95: React to keepAwake setting
        updateKeepAwake();
    } catch (e) {
        console.error('[AGENT] Failed to save overlay settings:', e);
    }
}

function updateKeepAwake(): void {
    if (overlaySettings.keepAwake) {
        if (powerSaveId === null) {
            powerSaveId = powerSaveBlocker.start('prevent-display-sleep');
            console.log('[AGENT] Power Save Blocker started ID:', powerSaveId);
        }
    } else {
        if (powerSaveId !== null) {
            powerSaveBlocker.stop(powerSaveId);
            console.log('[AGENT] Power Save Blocker stopped ID:', powerSaveId);
            powerSaveId = null;
        }
    }
}

function createOverlayWindow(): void {
    if (overlayWindow) return;

    const primaryDisplay = screen.getPrimaryDisplay();
    const { width } = primaryDisplay.workAreaSize;

    overlayWindow = new BrowserWindow({
        width: 320,
        height: 120, // Increased height for multiple rows
        x: 0,
        y: 0,
        frame: false,
        transparent: true,
        resizable: false,
        movable: false,
        minimizable: false,
        maximizable: false,
        closable: false,
        focusable: false,
        skipTaskbar: true,
        alwaysOnTop: true,
        hasShadow: false,
        type: 'toolbar',
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
    });

    overlayWindow.setAlwaysOnTop(true, 'screen-saver');
    overlayWindow.setIgnoreMouseEvents(true, { forward: true });
    overlayWindow.setVisibleOnAllWorkspaces(true);

    overlayWindow.loadFile(getResourcePath('overlay.html'));

    overlayWindow.once('ready-to-show', () => {
        runOverlayCheck();
    });

    overlayWindow.on('closed', () => {
        overlayWindow = null;
    });
}

function destroyOverlayWindow(): void {
    if (overlayWindow) {
        overlayWindow.destroy();
        overlayWindow = null;
    }
    if (overlayCheckInterval) {
        clearInterval(overlayCheckInterval);
        overlayCheckInterval = null;
    }
}

async function runOverlayCheck(): Promise<void> {
    if (!overlayWindow || !overlaySettings.enabled) return;

    const payload: any = {
        hostname: process.env.COMPUTERNAME || 'Local PC',
        version: getConfig().version,
        apps: []
    };

    const checkedApps = [];
    if (overlaySettings.tanium) checkedApps.push('Tanium');
    if (overlaySettings.crowdstrike) checkedApps.push('CrowdStrike');
    if (overlaySettings.mcafee) checkedApps.push('McAfee');

    if (checkedApps.length === 0) {
        overlayWindow.webContents.send('overlay-update', payload);
        return;
    }

    try {
        const installedApps = await getInstalledApps();
        const installedNames = installedApps.map((a: any) => a.name.toLowerCase());

        for (const appName of checkedApps) {
            const found = installedNames.some((n: string) => n.includes(appName.toLowerCase()));
            payload.apps.push({
                name: appName,
                status: found ? 'green' : 'red'
            });
        }

        overlayWindow.webContents.send('overlay-update', payload);
    } catch (e) {
        console.error('[AGENT] Overlay check failed:', e);
        overlayWindow.webContents.send('overlay-update', payload);
    }
}

function startOverlayChecks(): void {
    if (overlayCheckInterval) clearInterval(overlayCheckInterval);
    // Check every 60 seconds
    overlayCheckInterval = setInterval(runOverlayCheck, 60000);
    // Also run immediately
    setTimeout(runOverlayCheck, 1000);
}

function stealFocusToCapture() {
  if (!captureWindow || captureWindow.isDestroyed()) return;
  try {
    const targetPtr = captureWindow.getNativeWindowHandle();
    const fgHwnd = GetForegroundWindow();
    previousHwnd = fgHwnd;
    
    const fgTid = GetWindowThreadProcessId(fgHwnd, null);
    const targetTid = GetWindowThreadProcessId(targetPtr, null);
    const nodeTid = GetCurrentThreadId();

    if (fgTid !== targetTid) {
      AttachThreadInput(fgTid, targetTid, true);
      AttachThreadInput(fgTid, nodeTid, true);
    }
    
    SetForegroundWindow(targetPtr);
    BringWindowToTop(targetPtr);
    SetFocus(targetPtr);
    
    captureWindow.focus();

    if (fgTid !== targetTid) {
      AttachThreadInput(fgTid, targetTid, false);
      AttachThreadInput(fgTid, nodeTid, false);
    }
    console.log('[KOFFI] Focused capture window successfully.');
  } catch (err) {
    console.error('[KOFFI] Failed to steal focus:', err);
  }
}

async function executeScannerAction(action: string, appPath: string) {
  console.log(`[ACTION] ${action} -> ${appPath}`);
  const safePath = `"${appPath.replace(/"/g, '')}"`;
  
  return new Promise((resolve) => {
    try {
      if (action === 'system-restart') {
        exec('shutdown /r /f /t 0');
        resolve(true);
      } else if (action === 'system-shutdown') {
        exec('shutdown /s /f /t 0');
        resolve(true);
      } else if (action === 'start') {
        exec(safePath, { windowsHide: true }, (err) => {
          if (err) console.error('[ACTION] Start failed:', err);
        });
        resolve(true);
      } else if (action === 'restart') {
        const fileName = path.basename(appPath);
        exec(`taskkill /IM "${fileName}" /F`, () => {
          setTimeout(() => {
            exec(safePath, { windowsHide: true });
            resolve(true);
          }, 1000);
        });
      } else if (action === 'focus') {
        const fileName = path.basename(appPath, path.extname(appPath));
        const ps = `$p = Get-Process -Name '${fileName.replace(/'/g, '')}' -EA SilentlyContinue | Select -First 1; if($p){(New-Object -Com wscript.shell).AppActivate($p.Id)}`;
        exec(`powershell.exe -NoProfile -Command "${ps}"`, () => resolve(true));
      } else {
        resolve(false);
      }
    } catch (err) {
      console.error('[ACTION] Error:', err);
      resolve(false);
    }
  });
}

function setupIpcHandlers(): void {
    ipcMain.handle('get-system-info', async () => {
        const cached = getCachedSystemInfo();
        if (cached) return cached;
        const info = await getSystemInfo(true);
        updateSystemInfoCache(info, false); // Don't emit event loop
        return info;
    });

    ipcMain.handle('get-installed-apps', async () => {
        return await getInstalledApps();
    });

    ipcMain.handle('get-network-interfaces', async () => {
        return await getNetworkInterfaces();
    });

    ipcMain.handle('rescan-network', async (_, adapterName) => {
        console.log('[AGENT] Manual Network Rescan requested. Adapter:', adapterName || 'Auto');

        // v1.0.75 FIX: Clear cached VLAN ID so we grab the new untagged network instantly
        clearVlanCache();

        // 1. Immediately update cache to "Scanning..." for feedback
        const current = getCachedSystemInfo() || {};
        const tempState = {
            ...current,
            vlanId: 'Scanning...',
            switchPort: 'Scanning...',
            switchName: 'Scanning...',
            switchIp: 'Scanning...',
            switchPlatform: 'Scanning...'
        };
        updateSystemInfoCache(tempState);

        // 2. Trigger background scan
        getSystemInfo(false, adapterName).then(info => {
            console.log('[AGENT] Rescan complete. VLAN:', info.vlanId);
            updateSystemInfoCache(info);
            // v1.0.75 FIX: Also trigger a full sync to push the newly discovered IP/VLAN to the dashboard
            const { registerAgent } = require('./services/api-client');
            registerAgent().catch((e: any) => console.error('[AGENT] Failed to sync IP after rescan', e));
        });

        return true;
    });

    ipcMain.handle('get-info-page', async () => {
        // Refresh cache
        const data = await fetchInfoPage();
        if (data) cachedInfoPage = data;
        return cachedInfoPage;
    });

    ipcMain.handle('get-agent-version', () => {
        return getConfig().version;
    });

    // v1.0.88: Status overlay IPC handlers
    ipcMain.handle('toggle-overlay', async (_, enabled: boolean) => {
        overlaySettings.enabled = enabled;
        saveOverlaySettings();
        if (enabled) {
            createOverlayWindow();
            startOverlayChecks();
        } else {
            destroyOverlayWindow();
        }
        return true;
    });

    ipcMain.handle('update-overlay-checks', async (_, checks: { tanium: boolean; crowdstrike: boolean; mcafee: boolean }) => {
        overlaySettings.tanium = checks.tanium;
        overlaySettings.crowdstrike = checks.crowdstrike;
        overlaySettings.mcafee = checks.mcafee;
        saveOverlaySettings();
        runOverlayCheck();
        return true;
    });

    ipcMain.handle('get-overlay-settings', () => {
        return overlaySettings;
    });

    // v1.0.95: Optimization handlers
    ipcMain.handle('update-optimization-settings', async (_, settings: { keepAwake: boolean }) => {
        overlaySettings.keepAwake = settings.keepAwake;
        saveOverlaySettings();
        return true;
    });

    // v1.1.6: Two-way metadata sync
    ipcMain.handle('get-metadata', async () => {
        return await fetchMetadata();
    });

    ipcMain.handle('update-metadata', async (_, data: { category: string; location: string; department: string; family: string }) => {
        return await updateMetadata(data);
    });

    ipcMain.handle('get-apps-status', async () => {
        try {
            const installedApps = await getInstalledApps();
            const installedNames = installedApps.map((a: any) => a.name.toLowerCase());
            return {
                tanium: installedNames.some((n: string) => n.includes('tanium')),
                crowdstrike: installedNames.some((n: string) => n.includes('crowdstrike'))
            };
        } catch (e) {
            return { tanium: false, crowdstrike: false };
        }
    });

    ipcMain.on('close-popup', () => {
        popupWindow?.hide();
    });

    ipcMain.on('minimize-popup', () => {
        popupWindow?.minimize();
    });

    // v1.1.7: PC Block / Unblock IPC
    ipcMain.handle('submit-unlock-password', async (_, password) => {
        if (password === 'Aptiv@2026') {
            await setLocalUnblock();
            return true;
        }
        return false;
    });

    // Scanner IPC Handlers
    ipcMain.handle('load-scanner-rules', () => {
        return { system: SYSTEM_RULES, user: loadRules() };
    });

    ipcMain.handle('save-scanner-rules', (_, rules) => {
        fs.writeFileSync(DATA_FILE, JSON.stringify(rules, null, 2));
        return true;
    });

    ipcMain.on('release-focus', () => {
        if (previousHwnd) {
            console.log('[KOFFI] 10s Timeout. Returning focus to original window.');
            SetForegroundWindow(previousHwnd);
        }
    });

    ipcMain.on('scan-complete', (event, scannedText) => {
        const text = scannedText.toUpperCase().trim();
        console.log(`[SCAN] Captured: "${text}"`);
      
        if (previousHwnd) {
            SetForegroundWindow(previousHwnd);
        }
      
        const sysRule = SYSTEM_RULES.find(r => r.text === text);
        if (sysRule) {
            executeScannerAction(sysRule.action, sysRule.path);
            popupWindow?.webContents.send('scan-executed', { text, action: sysRule.action, path: sysRule.path, success: true });
            return;
        }
      
        const rules = loadRules();
        const rule = rules.find((r: any) => r.text.toUpperCase() === text);
        if (rule) {
            executeScannerAction(rule.action, rule.path);
            popupWindow?.webContents.send('scan-executed', { text, action: rule.action, path: rule.path, success: true });
        } else {
            popupWindow?.webContents.send('scan-executed', { text, action: null, path: null, success: false });
        }
    });
}

// Periodically refresh info page cache
function startInfoPagePolling(): void {
    const poll = async () => {
        const data = await fetchInfoPage();
        if (data) cachedInfoPage = data;
    };
    poll(); // Initial fetch
    setInterval(poll, getConfig().infoPagePollIntervalMs);
}

async function ensureNpcapInstalled(): Promise<void> {
    // NOTE: Npcap is installed by the elevated NSIS installer during setup.
    // The agent must NEVER attempt to install drivers at runtime because:
    // 1. It runs as LeastPrivilege (standard user) via Scheduled Task.
    // 2. Spawning an admin installer from a standard user process triggers a UAC
    //    prompt on every agent startup, which is the bug we are fixing.
    // This function is intentionally a no-op and kept only for reference.
    const pcapPath = path.join(process.env.WINDIR || 'C:\\Windows', 'System32', 'wpcap.dll');
    if (fs.existsSync(pcapPath)) {
        console.log('[AGENT] Npcap detected.');
    } else {
        // Log only — do not attempt to install.
        console.warn('[AGENT] Npcap not detected. Network scanning will be limited. Npcap should be installed by the setup installer.');
    }
}

app.whenReady().then(async () => {
    loadConfig();

    // v1.2.1 FIX: --first-run mode.
    // The NSIS installer launches the agent immediately after install with this flag.
    // On Autopilot machines, Npcap drivers and Scheduled Tasks are not yet active at this
    // point, so attempting to start services causes UAC prompts and errors.
    // Instead, show a tray notification prompting the user to restart, then quit.
    if (process.argv.includes('--first-run')) {
        console.log('[AGENT] First-run mode detected. Showing restart prompt and exiting.');
        createTray();
        tray?.displayBalloon({
            title: 'VersAgent Installed',
            content: 'Installation complete. Please restart your PC to activate the agent.',
            iconType: 'info',
        });
        // Give the balloon a few seconds to be visible before quitting
        setTimeout(() => app.quit(), 8000);
        return;
    }

    // Normal startup path (launched by Scheduled Task after reboot)
    // v1.0.78: Npcap check is now log-only — installer handles Npcap installation.
    await ensureNpcapInstalled();

    setupAutoStart();
    createTray();
    setupIpcHandlers();
    startBackgroundServices();
    startInfoPagePolling();

    // v1.0.88: Load overlay settings and restore overlay if it was enabled
    loadOverlaySettings();
    if (overlaySettings.enabled) {
        createOverlayWindow();
        startOverlayChecks();
    }
    
    // Scanner integration
    createCaptureWindow();
    const registeredBacktick = globalShortcut.register('`', () => {
        stealFocusToCapture();
    });
    if (!registeredBacktick) console.error('[AGENT] Failed to register backtick shortcut');

    // v1.1.7: PC Block event listeners and startup check
    AgentEvents.on('block-status-changed', (isBlocked: boolean, reason?: string) => {
        if (isBlocked) {
            // Block PC
            if (lockWindows.length === 0) {
                createLockWindow();
            } else {
                lockWindows.forEach(win => {
                    if (!win.isDestroyed()) {
                        win.webContents.send('show-lock-screen', { reason });
                    }
                });
            }
        } else {
            // Unblock PC
            lockWindows.forEach(w => {
                if (!w.isDestroyed()) w.destroy();
            });
            lockWindows = [];
        }
    });

    if (getConfig().isBlocked) {
        createLockWindow();
    }

    // Register global shortcut Ctrl+Alt+O
    const registeredO = globalShortcut.register('Ctrl+Alt+O', togglePopup);
    if (!registeredO) {
        console.error('[AGENT] Failed to register Ctrl+Alt+O shortcut');
    }

    // v1.0.75 FIX: Global App Restart Shortcut
    const registeredR = globalShortcut.register('Ctrl+Alt+R', () => {
        console.log('[AGENT] Ctrl+Alt+R detected. Relaunching agent...');
        app.relaunch();
        app.quit();
    });
    if (!registeredR) {
        console.error('[AGENT] Failed to register Ctrl+Alt+R shortcut');
    }

    console.log('[AGENT] VersAgent started');
});

app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    stopBackgroundServices();
});

// Prevent app from closing when all windows close (keep tray alive)
app.on('window-all-closed', () => {
    // Do nothing — keep tray alive
});

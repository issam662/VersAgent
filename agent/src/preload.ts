import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('agentAPI', {
    getSystemInfo: () => ipcRenderer.invoke('get-system-info'),
    getInstalledApps: () => ipcRenderer.invoke('get-installed-apps'),
    getInfoPage: () => ipcRenderer.invoke('get-info-page'),
    getAgentVersion: () => ipcRenderer.invoke('get-agent-version'),
    getNetworkInterfaces: () => ipcRenderer.invoke('get-network-interfaces'),
    rescanNetwork: (adapterName?: string) => ipcRenderer.invoke('rescan-network', adapterName),
    onSystemInfoUpdated: (callback: (info: any) => void) => ipcRenderer.on('system-info-updated', (_event, info) => callback(info)),
    onLockUI: (callback: () => void) => ipcRenderer.on('lock-ui', () => callback()),
    closeWindow: () => ipcRenderer.send('close-popup'),
    minimizeWindow: () => ipcRenderer.send('minimize-popup'),
    // v1.0.88: Status overlay
    toggleOverlay: (enabled: boolean) => ipcRenderer.invoke('toggle-overlay', enabled),
    updateOverlayChecks: (checks: { tanium: boolean; crowdstrike: boolean; mcafee: boolean }) => ipcRenderer.invoke('update-overlay-checks', checks),
    getOverlaySettings: () => ipcRenderer.invoke('get-overlay-settings'),
    onOverlaySettingsChanged: (callback: (settings: any) => void) => ipcRenderer.on('overlay-settings-changed', (_event, settings) => callback(settings)),
    // v1.0.95: Optimization and App status
    updateOptimizationSettings: (settings: { keepAwake: boolean }) => ipcRenderer.invoke('update-optimization-settings', settings),
    getAppsStatus: () => ipcRenderer.invoke('get-apps-status'),
    // v1.1.6: Two-way metadata sync
    getMetadata: () => ipcRenderer.invoke('get-metadata'),
    updateMetadata: (data: { category: string; location: string; department: string; family: string }) => ipcRenderer.invoke('update-metadata', data),
    // v1.1.7: PC Block / Unblock
    onShowLockScreen: (callback: (data: { isPrimary: boolean }) => void) => ipcRenderer.on('show-lock-screen', (_event, data) => callback(data || { isPrimary: true })),
    submitUnlockPassword: (password: string) => ipcRenderer.invoke('submit-unlock-password', password),
    
    // Scanner Rules
    loadScannerRules: () => ipcRenderer.invoke('load-scanner-rules'),
    saveScannerRules: (rules: any) => ipcRenderer.invoke('save-scanner-rules', rules),
    onScanExecuted: (callback: (data: any) => void) => ipcRenderer.on('scan-executed', (_event, data) => callback(data)),
});

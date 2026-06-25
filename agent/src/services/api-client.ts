import axios from 'axios';
import https from 'https';
import { getConfig, saveConfig } from '../config';
import { getSystemInfo } from './system-info';
import { getInstalledApps } from './installed-apps';
import { EventEmitter } from 'events';

export const AgentEvents = new EventEmitter();

let heartbeatTimer: NodeJS.Timeout | null = null;
let inventoryTimer: NodeJS.Timeout | null = null;

function getApiClient() {
    const config = getConfig();
    return axios.create({
        baseURL: config.serverUrl,
        timeout: 15000,
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': config.apiKey,
        },
        httpsAgent: new https.Agent({
            rejectUnauthorized: config.rejectUnauthorized ?? true
        })
    });
}

import fs from 'fs';
import path from 'path';

import { logToAgent } from './logger';
import { app } from 'electron';

function logToFile(msg: string) {
    logToAgent('API', msg);
}

import { dbFetchInfoPage, dbFetchMetadata, dbRegisterAgent, dbSendHeartbeat, dbSendInventory, dbUpdateMetadata, dbUpdateMetadataOnly, dbSetMachineActive } from './db-client';
import os from 'os';
import { promisify } from 'util';
import { exec } from 'child_process';
const execAsync = promisify(exec);

export async function syncMetadataFast(): Promise<void> {
    try {
        logToFile('Performing Fast Metadata Sync...');
        const hostname = os.hostname();
        // Fallback to fast scan to get SN natively
        const sysInfo = await getSystemInfo(true);
        const serialNumber = sysInfo.serialNumber || 'UNKNOWN';

        await dbUpdateMetadataOnly({ hostname, serialNumber });
    } catch (e: any) {
        logToFile(`Fast Sync failed: ${e.message}`);
    }
}

let isRegistering = false;

export async function registerAgent(): Promise<void> {
    if (isRegistering) {
        logToFile('Registration already in progress, skipping duplicate call...');
        return;
    }
    isRegistering = true;
    try {
        const config = getConfig();

        logToFile('Calling getSystemInfo()...');
        let sysInfo;
        try {
            sysInfo = await getSystemInfo();
            logToFile('getSystemInfo returned successfully.');
        } catch (e: any) {
            logToFile(`getSystemInfo failed: ${e.message}`);
            console.error(e);
            return;
        }

        // Try direct DB first (works across network without Express server)
        logToFile(`Attempting direct DB registration (Target Server: ${config.dbServer || 'DEFAULT'})...`);
        const dbResult = await dbRegisterAgent(sysInfo);
        const latestConfig = getConfig();
        if (latestConfig.pendingUnblockSync) {
            await syncLocalUnblock();
        }

        if (dbResult) {
            const { machineId, agentId } = dbResult;
            saveConfig({ agentId, machineId });
            const msg = `[AGENT] Registered via DB: machineId=${machineId}, agentId=${agentId}`;
            console.log(msg);
            logToFile(msg);
            // Fetch metadata to get active status
            const initialMeta = await dbFetchMetadata();
            if (initialMeta) checkBlockStatus(initialMeta.active, initialMeta.blockReason);
            return;
        }

        // Fallback to HTTP API
        logToFile(`DB registration failed. Falling back to HTTP API (Target URL: ${config.serverUrl})...`);
        try {
            const api = getApiClient();
            logToFile(`Registering agent via HTTP: ${sysInfo.hostname}, Server: ${config.serverUrl}`);
            const response = await api.post('/agent/register', {
                hostname: sysInfo.hostname,
                serialNumber: sysInfo.serialNumber,
                agentVersion: config.version,
                osName: sysInfo.osName,
                osVersion: sysInfo.osVersion,
                osBuild: sysInfo.osBuild,
                macAddresses: sysInfo.macAddresses,
                ipAddresses: sysInfo.ipAddresses,
                dnsServers: sysInfo.dnsServers,
                defaultGateway: sysInfo.defaultGateway,
                cpu: sysInfo.cpu,
                totalMemoryGB: sysInfo.totalMemoryGB,
                totalDiskGB: sysInfo.totalDiskGB,
                domain: sysInfo.domain,
                vlanId: sysInfo.vlanId,
                switchPort: sysInfo.switchPort,
                switchName: sysInfo.switchName,
                switchIp: sysInfo.switchIp,
                switchPlatform: sysInfo.switchPlatform,
                currentUser: sysInfo.currentUser,
                category: config.category,
                department: config.department,
                location: config.location,
                family: config.family,
            });

            const { machineId, agentId, heartbeatInterval } = response.data;
            saveConfig({
                agentId,
                machineId,
                heartbeatIntervalMs: (heartbeatInterval || 60) * 1000,
            });

            const msg = `[AGENT] Registered via HTTP: machineId=${machineId}, agentId=${agentId}`;
            console.log(msg);
            logToFile(msg);
        } catch (err: any) {
            const msg = `[AGENT] Both DB and HTTP registration failed: ${err.message}`;
            console.error(msg);
            logToFile(msg);
            if (err.response) {
                logToFile(`Status: ${err.response.status}, Data: ${JSON.stringify(err.response.data)}`);
            }
        }
    } finally {
        isRegistering = false;
    }
}

async function sendHeartbeat(): Promise<void> {
    const config = getConfig();
    if (!config.agentId) return;

    // Try DB first
    const dbResult = await dbSendHeartbeat();
    if (dbResult && typeof dbResult === 'object') {
        // v1.1.6: Sync metadata from DB into local config
        saveConfig({
            category: dbResult.category || config.category,
            location: dbResult.location || '',
            department: dbResult.department || '',
            family: dbResult.family || ''
        });

        // v1.1.7: Check active state
        if (config.pendingUnblockSync) {
            await syncLocalUnblock();
        } else {
            checkBlockStatus(dbResult.active, dbResult.blockReason);
        }
        return;
    }
    if (dbResult === true) return;

    // Fallback to HTTP
    try {
        const api = getApiClient();
        await api.post('/agent/heartbeat', { agentId: config.agentId });
    } catch (err: any) {
        console.error('[AGENT] Heartbeat failed:', err.message);
        logToFile(`Heartbeat failed (both DB and HTTP): ${err.message}`);
        if (err.response?.status === 404) {
            logToFile('Heartbeat 404, re-registering...');
            await registerAgent();
        }
    }
}

async function sendInventory(): Promise<void> {
    const config = getConfig();
    if (!config.agentId) {
        logToFile('Skipping inventory: No Agent ID configured.');
        return;
    }

    try {
        logToFile('Starting inventory collection...');
        const sysInfo = await getSystemInfo(true);
        const installedApps = await getInstalledApps();

        logToFile(`Collected ${installedApps.length} apps. Trying DB first...`);

        // Try DB first
        const dbOk = await dbSendInventory(sysInfo, installedApps.map(app => ({
            name: app.name, version: app.version,
            publisher: app.publisher, installDate: app.installDate
        })));
        if (dbOk) {
            logToFile(`[AGENT] Inventory sent via DB: ${installedApps.length} apps`);
            // v1.0.75 FIX: Also trigger a full agent registration (IP sync) during the 30-min inventory cycle.
            logToFile('[AGENT] Triggering full IP/Network sync alongside DB inventory...');
            registerAgent().catch(e => logToFile(`Background sync failed: ${e}`));
            return;
        }

        // Fallback to HTTP
        logToFile('DB inventory failed, falling back to HTTP...');
        const api = getApiClient();
        await api.post('/agent/inventory', {
            agentId: config.agentId,
            osName: sysInfo.osName,
            osVersion: sysInfo.osVersion,
            osBuild: sysInfo.osBuild,
            currentUser: sysInfo.currentUser,
            installedApps: installedApps.map(app => ({
                name: app.name, version: app.version,
                publisher: app.publisher, installDate: app.installDate
            })),
        });

        logToFile(`[AGENT] Inventory sent via HTTP: ${installedApps.length} apps`);

        // v1.0.75 FIX: Also trigger a full agent registration (IP sync) during the 30-min inventory cycle.
        logToFile('[AGENT] Triggering full IP/Network sync alongside HTTP inventory...');
        registerAgent().catch(e => logToFile(`Background sync failed: ${e}`));
    } catch (err: any) {
        const msg = `[AGENT] Inventory failed: ${err.message}`;
        console.error(msg);
        logToFile(msg);
    }
}


export async function fetchInfoPage(): Promise<any> {
    try {
        // v1.1.4: Direct SQL Only. Bypassing HTTP to ensure it works across VLANs without Port 3002.
        const dbData = await dbFetchInfoPage();
        if (dbData) {
            return dbData;
        }
    } catch (dbErr: any) {
        console.error('[AGENT] SQL Info page fetch failed:', dbErr.message);
    }

    return null;
}

// v1.1.6: Fetch live metadata from DB for agent UI display
export async function fetchMetadata(): Promise<any> {
    const meta = await dbFetchMetadata();
    if (meta) {
        checkBlockStatus(meta.active, meta.blockReason);
    }
    return meta;
}

// v1.1.6: Update metadata from agent UI and sync to DB + local config
export async function updateMetadata(data: { category: string; location: string; department: string; family: string }): Promise<boolean> {
    const ok = await dbUpdateMetadata(data);
    if (ok) {
        saveConfig({
            category: data.category,
            location: data.location,
            department: data.department,
            family: data.family
        });
        logToFile(`Metadata updated from UI and synced: ${JSON.stringify(data)}`);
    }
    return ok;
}

import { clearVlanCache } from './system-info';
import { invalidateNetworkCache } from './cache';
import { spawn, ChildProcess } from 'child_process';

let networkListenerProcess: ChildProcess | null = null;

export function startBackgroundServices(): void {
    const config = getConfig();

    logToFile('Starting background services...');

    syncMetadataFast();
    registerAgent();

    heartbeatTimer = setInterval(sendHeartbeat, config.heartbeatIntervalMs);
    inventoryTimer = setInterval(sendInventory, config.inventoryIntervalMs);

    setTimeout(sendInventory, 10000);

    // -- PowerShell Network Listener (Add-Type, no unsigned exe) --
    let scannerScriptPath = '';
    if (app.isPackaged) {
        scannerScriptPath = path.join(process.resourcesPath, 'resources', 'scripts', 'RunScanner.ps1');
    } else {
        scannerScriptPath = path.resolve(__dirname, '../../src/resources/scripts/RunScanner.ps1');
    }

    if (fs.existsSync(scannerScriptPath)) {
        try {
            networkListenerProcess = spawn('powershell', [
                '-ExecutionPolicy', 'Bypass',
                '-WindowStyle', 'Hidden',
                '-File', scannerScriptPath,
                'listen'
            ], { stdio: ['ignore', 'pipe', 'ignore'] });
            networkListenerProcess.stdout?.on('data', (data) => {
                const out = data.toString();
                if (out.includes('NetworkAddressChanged') || out.includes('NetworkAvailabilityChanged')) {
                    logToFile(`[AGENT] Network change event detected: ${out.trim()}`);
                    invalidateNetworkCache();
                    clearVlanCache();
                    registerAgent().catch(e => logToFile(`Sync on network change failed: ${e}`));
                }
            });
            networkListenerProcess.on('error', (err) => {
                logToFile(`[AGENT] PowerShell listener error: ${err.message}`);
            });
            logToFile('[AGENT] PowerShell network listener initialized successfully.');
        } catch (e: any) {
            logToFile(`[AGENT] Failed to start PowerShell network listener: ${e.message}`);
        }
    } else {
        logToFile('[AGENT] WARNING: RunScanner.ps1 not found. Network listener disabled.');
    }

    console.log('[AGENT] Background services started');
}

export function stopBackgroundServices(): void {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    if (inventoryTimer) clearInterval(inventoryTimer);
    heartbeatTimer = null;
    inventoryTimer = null;

    if (networkListenerProcess) {
        try {
            networkListenerProcess.kill();
        } catch { }
        networkListenerProcess = null;
    }

    console.log('[AGENT] Background services stopped');
}

// v1.1.7: Process PC active status
// v1.1.8: Process custom block message
export function checkBlockStatus(active: boolean | undefined, reason: string = '') {
    if (active === undefined) return;
    const config = getConfig();
    const isNowBlocked = !active;

    // Only act if the state changed
    if (isNowBlocked && !config.isBlocked) {
        logToFile(`PC has been BLOCKED remotely. Reason: ${reason}`);
        config.isBlocked = true;
        config.blockReason = reason;
        saveConfig(config);
        AgentEvents.emit('block-status-changed', true, reason);
    } else if (!isNowBlocked && config.isBlocked && !config.pendingUnblockSync) {
        logToFile('PC has been UNBLOCKED remotely.');
        config.isBlocked = false;
        config.blockReason = '';
        saveConfig(config);
        AgentEvents.emit('block-status-changed', false, '');
    }
}

export async function setLocalUnblock() {
    logToFile('PC has been UNBLOCKED locally by IT password.');
    const config = getConfig();
    config.isBlocked = false;
    config.blockReason = '';
    config.pendingUnblockSync = true;
    saveConfig(config);
    AgentEvents.emit('block-status-changed', false, '');
    await syncLocalUnblock();
}

export async function manuallyTriggerLock() {
    logToFile('PC lock triggered manually or on startup.');
    const config = getConfig();
    config.isBlocked = true;
    saveConfig(config);
    AgentEvents.emit('block-status-changed', true, config.blockReason || '');
}

async function syncLocalUnblock() {
    logToFile('Syncing local unblock to DB...');
    const ok = await dbSetMachineActive(true);
    if (ok) {
        saveConfig({ pendingUnblockSync: false });
        logToFile('Local unblock successfully synced to DB.');
    } else {
        logToFile('Failed to sync local unblock, will retry later.');
    }
}

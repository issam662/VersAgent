import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { logToAgent } from './logger';

function logToDebug(msg: string) {
    logToAgent('SystemInfo', msg);
}

const execAsync = promisify(exec);

let cachedVlanId: string | null = null;
let cachedSystemInfo: SystemInfo | null = null;

export interface SystemInfo {
    hostname: string;
    serialNumber: string;
    osName: string;
    osVersion: string;
    osBuild: string;
    macAddresses: string[];
    ipAddresses: string[];
    dnsServers: string[];
    defaultGateway: string;
    domain: string;
    vlanId: string;
    switchPort: string;
    switchName: string;
    switchIp: string;
    switchPlatform: string;
    cpu: string;
    totalMemoryGB: number;
    totalDiskGB: number;
    currentUser: string;
}

export function clearVlanCache() {
    cachedVlanId = null;
    logToDebug('VLAN cache manually cleared via rescan.');
}

export function setDiscoveryInfo(data: Partial<SystemInfo>) {
    if (data.vlanId) cachedVlanId = data.vlanId;
    if (cachedSystemInfo) {
        if (data.vlanId) cachedSystemInfo.vlanId = data.vlanId;
        if (data.switchPort) cachedSystemInfo.switchPort = data.switchPort;
        if (data.switchName) cachedSystemInfo.switchName = data.switchName;
        if (data.switchIp) cachedSystemInfo.switchIp = data.switchIp;
        if (data.switchPlatform) cachedSystemInfo.switchPlatform = data.switchPlatform;
    }
    logToDebug(`Background Discovery Info updated: VLAN=${data.vlanId}, Port=${data.switchPort}`);
}

function getScannerScriptPath(): string {
    if (app.isPackaged) {
        return path.join(process.resourcesPath, 'resources', 'scripts', 'RunScanner.ps1');
    }
    return path.resolve(__dirname, '../../src/resources/scripts/RunScanner.ps1');
}

async function runScanner(action: string, timeout: number = 90000): Promise<string> {
    const scriptPath = getScannerScriptPath();
    if (!fs.existsSync(scriptPath)) {
        throw new Error(`RunScanner.ps1 not found at ${scriptPath}`);
    }
    const cmd = `powershell -ExecutionPolicy Bypass -WindowStyle Hidden -File "${scriptPath}" ${action}`;
    const { stdout } = await execAsync(cmd, { timeout });
    return stdout.trim();
}

export async function getSystemInfo(skipCdp: boolean = false, adapterName?: string): Promise<SystemInfo> {
    console.log('[SystemInfo] Starting getSystemInfo via PowerShell Add-Type...');
    const hostname = os.hostname();

    // Default values if scanner fails
    let serialNumber = 'UNKNOWN';
    let domain = '';
    let currentUser = '';
    let osName = `${os.type()} ${os.release()}`;
    let osVersion = os.release();
    let osBuild = '';
    let totalDiskGB = 0;
    let cpu = 'Unknown';
    let vlanId = skipCdp ? (cachedVlanId || '-') : 'Scanning...';
    let switchPort = skipCdp ? '-' : 'Scanning...';
    let switchName = skipCdp ? '-' : 'Scanning...';
    let switchIp = skipCdp ? '-' : 'Scanning...';
    let switchPlatform = skipCdp ? '-' : 'Scanning...';
    let defaultGateway = '';
    let physicalAdapterNames: string[] = [];

    // Run C# scanner via PowerShell Add-Type
    try {
        const stdout = await runScanner('scan');
        const data = JSON.parse(stdout);

        serialNumber = data.serialNumber || 'UNKNOWN';
        domain = data.domain || '';
        currentUser = data.currentUser || '';

        if (data.osName) osName = data.osName;
        if (data.osVersion) osVersion = data.osVersion;
        if (data.osBuild) osBuild = data.osBuild;
        if (data.cpu) cpu = data.cpu;
        if (data.totalDiskGB) totalDiskGB = data.totalDiskGB;

        defaultGateway = data.defaultGateway || '';

        if (data.physicalAdapters) {
            physicalAdapterNames = data.physicalAdapters.split(',').map((s: string) => s.trim()).filter(Boolean);
        }

        if (!skipCdp) {
            vlanId = data.vlanId || '0 (Untagged)';
            switchPort = data.switchPort || 'Unknown';
            switchName = data.switchName || 'Unknown';
            switchIp = data.switchIp || 'Unknown';
            switchPlatform = data.switchPlatform || 'Unknown';
            if (data.isWireless && data.ssid) {
                vlanId = `${data.ssid} (Wi-Fi)`;
                switchPort = 'N/A (Wireless)';
                switchName = 'N/A (Wireless)';
                switchIp = 'N/A (Wireless)';
                switchPlatform = 'N/A (Wireless)';
            }
            cachedVlanId = vlanId;
        } else if (!cachedVlanId) {
            vlanId = '-';
            switchPort = '-';
            switchName = '-';
            switchIp = '-';
            switchPlatform = '-';
        }

    } catch (e: any) {
        console.error('[SystemInfo] PowerShell scanner failed:', e.message);
        logToDebug(`PowerShell scanner error: ${e.message}`);
        // v1.0.82 FIX: Frontend failsafe if scanner fails
        if (!skipCdp) {
            vlanId = '-';
            switchPort = 'Error';
            switchName = '-';
            switchIp = '-';
            switchPlatform = '-';
        }
    }

    // CPU and Memory fallback via standard OS modules
    if (cpu === 'Unknown') {
        const cpus = os.cpus();
        if (cpus.length > 0) cpu = cpus[0].model;
    }
    const totalMemoryGB = Math.round(os.totalmem() / (1024 * 1024 * 1024) * 10) / 10;

    // Network interfaces via OS module
    const interfaces = os.networkInterfaces();
    const macAddresses: string[] = [];
    const ipAddresses: string[] = [];

    for (const [ifaceName, addrs] of Object.entries(interfaces)) {
        if (!addrs) continue;

        if (ifaceName.toLowerCase().includes('loopback') || ifaceName.toLowerCase().includes('pseudo')) continue;

        const isPhysical = physicalAdapterNames.some(pn => ifaceName.includes(pn)) ||
            (ifaceName.toLowerCase().includes('ethernet') && !ifaceName.toLowerCase().includes('virtual')) ||
            (ifaceName.toLowerCase().includes('wi-fi') && !ifaceName.toLowerCase().includes('virtual'));

        if (!isPhysical) continue;

        for (const addr of addrs) {
            if (addr.internal) continue;
            if (addr.family === 'IPv4' && addr.mac && addr.mac !== '00:00:00:00:00:00' && !addr.address.startsWith('169.254')) {
                const macUpper = addr.mac.toUpperCase().replace(/:/g, '-');
                const isPrimarySubnet = defaultGateway && addr.address.split('.').slice(0, 3).join('.') === defaultGateway.split('.').slice(0, 3).join('.');

                if (isPrimarySubnet) {
                    macAddresses.unshift(macUpper);
                    ipAddresses.unshift(addr.address);
                } else {
                    macAddresses.push(macUpper);
                    ipAddresses.push(addr.address);
                }
            }
        }
    }

    // v1.0.88 FIX: Prioritize corporate 10.x.x.x IPs over 192.168.x.x peer-to-peer IPs.
    // On machines with multiple NICs (e.g. one for corporate network, one for direct PC-to-PC sharing),
    // ensure the corporate IP is reported first so the dashboard shows the correct address.
    const paired = macAddresses.map((mac, i) => ({ mac, ip: ipAddresses[i] }));
    paired.sort((a, b) => {
        const aIsCorp = a.ip.startsWith('10.');
        const bIsCorp = b.ip.startsWith('10.');
        if (aIsCorp && !bIsCorp) return -1;
        if (!aIsCorp && bIsCorp) return 1;
        return 0;
    });
    const sortedMacs = paired.map(p => p.mac);
    const sortedIps = paired.map(p => p.ip);

    const finalMacs = Array.from(new Set(sortedMacs));
    const finalIps = Array.from(new Set(sortedIps));

    // DNS servers via ipconfig
    let dnsServers: string[] = [];
    try {
        const { stdout } = await execAsync('ipconfig /all', { timeout: 10000 });
        const dnsMatches = stdout.match(/DNS Servers[\s.:]+(\\d+\\.\\d+\\.\\d+\\.\\d+)/g);
        if (dnsMatches) {
            dnsServers = dnsMatches.map(m => {
                const ip = m.match(/(\d+\.\d+\.\d+\.\d+)/);
                return ip ? ip[1] : '';
            }).filter(Boolean);
        }
    } catch { /* ignore */ }

    return {
        hostname,
        serialNumber,
        osName,
        osVersion,
        osBuild,
        macAddresses: finalMacs,
        ipAddresses: finalIps,
        dnsServers,
        defaultGateway,
        domain,
        vlanId,
        switchPort,
        switchName,
        switchIp,
        switchPlatform,
        cpu,
        totalMemoryGB,
        totalDiskGB,
        currentUser,
    };
}

export async function getNetworkInterfaces(): Promise<{ name: string; description: string }[]> {
    try {
        const stdout = await runScanner('adapters', 10000);
        return JSON.parse(stdout);
    } catch (e: any) {
        console.error('Failed to list interfaces via PowerShell:', e.message);
        return [];
    }
}

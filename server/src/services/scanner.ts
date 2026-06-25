import net from 'net';
import { exec } from 'child_process';
import { promisify } from 'util';
import { v4 as uuidv4 } from 'uuid';
import { dbRun, dbGet, runTransaction } from '../database/index.js';
import fs from 'fs';

const execAsync = promisify(exec);

export interface ScanResult {
    id: string;
    ip: string;
    hostname: string | null;
    mac_address: string | null;
    open_ports: number[];
    vulnerabilities: string[];
    scanned_at: string;
}

const COMMON_PORTS = [
    21,   // FTP
    22,   // SSH
    23,   // Telnet
    25,   // SMTP
    53,   // DNS
    80,   // HTTP
    110,  // POP3
    135,  // RPC
    137,  // NetBIOS Name Service
    139,  // SMB
    143,  // IMAP
    161,  // SNMP
    443,  // HTTPS
    445,  // SMB
    548,  // AFP
    1433, // MSSQL
    3306, // MySQL
    3389, // RDP
    5432, // PostgreSQL
    5900, // VNC
    8080, // HTTP Alt
    8443, // HTTPS Alt
    9100  // JetDirect (Printers)
];

const VULNERABILITY_MAP: Record<number, string> = {
    21: 'Unencrypted FTP service detected',
    23: 'Insecure Telnet service detected (Plaintext)',
    25: 'SMTP service detected',
    80: 'Unencrypted Web Server (HTTP)',
    135: 'RPC Endpoint (Potential vulnerability)',
    139: 'NetBIOS/SMB (Potential information leak)',
    445: 'SMB Service (Check for SMBv1)',
    3389: 'RDP enabled (Brute-force risk)'
};

/**
 * Pings an IP address to check if it's reachable.
 */
export async function ping(ip: string): Promise<boolean> {
    try {
        const command = process.platform === 'win32'
            ? `ping -n 1 -w 1000 ${ip}`
            : `ping -c 1 -W 1 ${ip}`;

        // Add a 2s timeout to the exec call itself
        await execAsync(command, { timeout: 2000 });
        return true;
    } catch {
        return false;
    }
}

/**
 * Pings a machine and updates its last_seen timestamp if successful.
 */
export async function pingMachine(id: string, ip: string): Promise<boolean> {
    const isAlive = await ping(ip);
    if (isAlive) {
        await dbRun("UPDATE machines SET last_seen = GETUTCDATE(), status = 'online' WHERE id = ?", [id]);
    } else {
        await dbRun("UPDATE machines SET status = 'offline' WHERE id = ?", [id]);
    }
    return isAlive;
}

/**
 * Checks if a specific TCP port is open and tries to grab a banner.
 */
function checkPortWithBanner(ip: string, port: number, timeout = 1500): Promise<{ isOpen: boolean; banner: string | null }> {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        let solved = false;

        const done = (isOpen: boolean, banner: string | null = null) => {
            if (solved) return;
            solved = true;
            socket.destroy();
            resolve({ isOpen, banner });
        };

        socket.setTimeout(timeout);

        socket.on('connect', () => {
            const chattyPorts = [21, 22, 25, 110, 143];
            if (chattyPorts.includes(port)) {
                // Wait up to 1s for a banner
                const bannerTimeout = setTimeout(() => done(true, null), 1000);
                socket.once('data', (data) => {
                    clearTimeout(bannerTimeout);
                    const banner = data.toString().trim().substring(0, 100);
                    done(true, banner);
                });
            } else {
                done(true, null);
            }
        });

        socket.on('timeout', () => done(false));
        socket.on('error', () => done(false));

        try {
            socket.connect(port, ip);
        } catch (err) {
            done(false);
        }
    });
}

/**
 * Scans a single host for common ports.
 */
async function scanHost(ip: string): Promise<ScanResult | null> {
    const isAlive = await ping(ip);
    if (!isAlive) return null;

    const openPorts: number[] = [];
    const vulnerabilities: string[] = [];

    // Scan ports in parallel chunks
    const chunkSize = 5;
    for (let i = 0; i < COMMON_PORTS.length; i += chunkSize) {
        const chunk = COMMON_PORTS.slice(i, i + chunkSize);
        try {
            const results = await Promise.all(chunk.map(port => checkPortWithBanner(ip, port)));
            chunk.forEach((port, index) => {
                const { isOpen, banner } = results[index];
                if (isOpen) {
                    openPorts.push(port);
                    let vuln = VULNERABILITY_MAP[port];
                    if (banner && banner.length > 0) {
                        vuln = `${vuln ? vuln + ' - ' : ''}Banner: ${banner}`;
                    }
                    if (vuln) vulnerabilities.push(vuln);
                }
            });
        } catch (err) {
            console.error(`[SCANNER] Port scan chunk failed for ${ip}:`, err);
        }
    }

    // If valid scan (alive), we should return result even if no ports are open
    // if (openPorts.length === 0) return null;

    // Try to resolve hostname (with 2s timeout)
    let hostname = null;
    try {
        const { stdout } = await execAsync(`nslookup ${ip}`, { timeout: 2000 });
        const nameMatch = stdout.match(/Name:\s+([^\r\n]+)/);
        if (nameMatch) hostname = nameMatch[1].trim();
    } catch { /* Ignore */ }

    // Try to get MAC address (with 2s timeout)
    let mac = null;
    try {
        const { stdout } = await execAsync(`arp -a ${ip}`, { timeout: 2000 });
        const macMatch = stdout.match(/([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})/);
        if (macMatch) mac = macMatch[0].toUpperCase();
    } catch { /* Ignore */ }

    return {
        id: uuidv4(),
        ip,
        hostname,
        mac_address: mac,
        open_ports: openPorts,
        vulnerabilities,
        scanned_at: new Date().toISOString()
    };
}

/**
 * Scans a network range (CIDR).
 * Restricted to /24 networks for performance.
 */
// Scanner State
let isScanning = false;
let shouldStop = false;
let currentProgress = {
    total: 0,
    current: 0,
    currentIp: '',
    scannedCount: 0
};

export function getScanStatus() {
    return {
        isRunning: isScanning,
        progress: currentProgress.total > 0 ? Math.round((currentProgress.current / currentProgress.total) * 100) : 0,
        currentIp: currentProgress.currentIp,
        scannedCount: currentProgress.scannedCount
    };
}

export function stopScan() {
    if (isScanning) {
        shouldStop = true;
    }
}

/**
 * Scans a network range (CIDR).
 * Restricted to /24 networks for performance.
 */
export async function scanNetwork(cidr: string): Promise<any> {
    if (isScanning) {
        throw new Error('Scan already in progress');
    }

    // Check if it's a single IP or CIDR
    if (!cidr.includes('/')) {
        // Single IP scan
        isScanning = true;
        shouldStop = false;
        currentProgress = { total: 1, current: 0, currentIp: cidr, scannedCount: 0 };

        let result = null;
        try {
            // Log scan start
            fs.appendFileSync('scan_debug.log', `[${new Date().toISOString()}] Scanning ${cidr}...\n`);

            result = await scanHost(cidr);

            fs.appendFileSync('scan_debug.log', `[${new Date().toISOString()}] Scan result for ${cidr}: ${JSON.stringify(result)}\n`);

            if (result) {
                currentProgress.scannedCount++;
                if (result.hostname) result.hostname = result.hostname.replace(/\.aptiv\.com$/i, '').split('.')[0];

                const existing = await dbGet('SELECT id FROM scan_results WHERE ip = ?', [result.ip]);
                if (existing) {
                    await dbRun('UPDATE scan_results SET hostname = ?, mac_address = ?, open_ports = ?, vulnerabilities = ?, scanned_at = ? WHERE ip = ?',
                        [result.hostname, result.mac_address, JSON.stringify(result.open_ports), JSON.stringify(result.vulnerabilities), result.scanned_at, result.ip]);
                    fs.appendFileSync('scan_debug.log', `[${new Date().toISOString()}] Updated DB for ${result.ip}\n`);
                } else {
                    await dbRun('INSERT INTO scan_results (id, ip, hostname, mac_address, open_ports, vulnerabilities, scanned_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
                        [result.id, result.ip, result.hostname, result.mac_address, JSON.stringify(result.open_ports), JSON.stringify(result.vulnerabilities), result.scanned_at]);
                    fs.appendFileSync('scan_debug.log', `[${new Date().toISOString()}] Inserted into DB for ${result.ip}\n`);
                }
            } else {
                fs.appendFileSync('scan_debug.log', `[${new Date().toISOString()}] Result was null for ${cidr}\n`);
            }
        } catch (err) {
            fs.appendFileSync('scan_debug.log', `[${new Date().toISOString()}] Error scanning ${cidr}: ${err}\n`);
        } finally {
            isScanning = false;
            shouldStop = false;
            currentProgress.currentIp = '';
        }
        return result || null;
    }

    const [baseIp, subnet] = cidr.split('/');
    if (subnet !== '24') {
        throw new Error('Only /24 subnets are supported for now (e.g., 192.168.1.1/24)');
    }

    isScanning = true;
    shouldStop = false;
    currentProgress = {
        total: 254,
        current: 0,
        currentIp: '',
        scannedCount: 0
    };

    try {
        const ipParts = baseIp.split('.');
        const ipPrefix = `${ipParts[0]}.${ipParts[1]}.${ipParts[2]}`;

        // Scan 1-254
        for (let i = 1; i < 255; i++) {
            if (shouldStop) break;

            const ip = `${ipPrefix}.${i}`;
            currentProgress.current = i;
            currentProgress.currentIp = ip;

            console.log(`[SCANNER] Scanning ${ip} (${i}/254)...`);

            try {
                const result = await scanHost(ip);

                if (result) {
                    console.log(`[SCANNER] Found active host: ${ip} (${result.hostname || 'No Hostname'})`);
                    currentProgress.scannedCount++;

                    // Modify hostname if it exists
                    if (result.hostname) {
                        result.hostname = result.hostname.replace(/\.aptiv\.com$/i, '').split('.')[0];
                    }

                    // Smart Update: Reconcile with existing inventory
                    await runTransaction(async () => {
                        let machineId: string | null = null;
                        let updateMsg = '';

                        // 1. Try to find by MAC Address (High Confidence)
                        if (result.mac_address) {
                            const existingByMac = await dbGet(
                                'SELECT machine_id, ip_address FROM network_interfaces WHERE mac_address = ?',
                                [result.mac_address]
                            );
                            if (existingByMac) {
                                machineId = existingByMac.machine_id;
                                if (existingByMac.ip_address !== result.ip) {
                                    // IP Changed! Update it.
                                    await dbRun(
                                        'UPDATE network_interfaces SET ip_address = ?, updated_at = GETUTCDATE() WHERE machine_id = ? AND mac_address = ?',
                                        [result.ip, machineId, result.mac_address]
                                    );
                                    updateMsg = `(IP updated from ${existingByMac.ip_address})`;
                                }
                            }
                        }

                        // 2. If not found by MAC, try by Hostname (Medium Confidence)
                        // Only if hostname exists and is not generic
                        if (!machineId && result.hostname && !result.hostname.startsWith('Device-')) {
                            const existingByHost = await dbGet(
                                'SELECT id FROM machines WHERE hostname = ?',
                                [result.hostname]
                            );
                            if (existingByHost) {
                                machineId = existingByHost.id;
                                // Check if we need to update IP in network_interfaces
                                // We might need to find the primary interface or create one
                                const nic = await dbGet('SELECT id, ip_address FROM network_interfaces WHERE machine_id = ?', [machineId]);
                                if (nic) {
                                    if (nic.ip_address !== result.ip) {
                                        await dbRun('UPDATE network_interfaces SET ip_address = ?, updated_at = GETUTCDATE() WHERE id = ?', [result.ip, nic.id]);
                                        updateMsg = `(IP updated from ${nic.ip_address} via Hostname)`;
                                    }
                                } else {
                                    // No NIC? Create one
                                    await dbRun(
                                        'INSERT INTO network_interfaces (id, machine_id, mac_address, ip_address, mapping_source) VALUES (?, ?, ?, ?, ?)',
                                        [uuidv4(), machineId, result.mac_address || 'unknown', result.ip, 'SmartScan']
                                    );
                                    updateMsg = `(New NIC created via Hostname)`;
                                }
                            }
                        }

                        // 3. Update Machine Status if identified
                        if (machineId) {
                            await dbRun(
                                "UPDATE machines SET last_seen = GETUTCDATE(), status = 'online' WHERE id = ?",
                                [machineId]
                            );
                            console.log(`[SCANNER] Reconciled ${result.ip} to Machine ID ${machineId} ${updateMsg}`);
                        }

                        // 4. Save to Scan Results (for history/unmanaged view)
                        const existing = await dbGet('SELECT id FROM scan_results WHERE ip = ?', [result.ip]);

                        if (existing) {
                            await dbRun(
                                'UPDATE scan_results SET hostname = ?, mac_address = ?, open_ports = ?, vulnerabilities = ?, scanned_at = ? WHERE ip = ?',
                                [result.hostname, result.mac_address, JSON.stringify(result.open_ports), JSON.stringify(result.vulnerabilities), result.scanned_at, result.ip]
                            );
                        } else {
                            await dbRun(
                                'INSERT INTO scan_results (id, ip, hostname, mac_address, open_ports, vulnerabilities, scanned_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
                                [result.id, result.ip, result.hostname, result.mac_address, JSON.stringify(result.open_ports), JSON.stringify(result.vulnerabilities), result.scanned_at]
                            );
                        }
                    });
                }
            } catch (hostError) {
                console.error(`[SCANNER] CRITICAL Error scanning host ${ip}:`, hostError);
                // Continue to next host
            }

            // Small cooldown between hosts to prevent resource exhaustion/rate limiting
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    } finally {
        isScanning = false;
        shouldStop = false;
        currentProgress.currentIp = '';
    }
}

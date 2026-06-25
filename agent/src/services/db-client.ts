// Direct MSSQL client for agent registration, heartbeat, and inventory
// Bypasses the Express server — connects directly to the database
// @ts-ignore
import sql from 'mssql';
import { v4 as uuidv4 } from 'uuid';
import { getConfig, saveConfig } from '../config';
import fs from 'fs';
import path from 'path';

let pool: any = null;

import { logToAgent } from './logger';

function logToFile(msg: string) {
    logToAgent('DB', msg);
}

async function getPool(): Promise<any> {
    if (pool) return pool;
    const config = getConfig();
    const dbConfig = {
        server: config.dbServer || 'EUMOOUJ-DB01',
        port: 1433, // Standard MSSQL port
        database: config.dbName || 'IT_Applications',
        user: config.dbUser || 'Issam_IT',
        password: config.dbPassword || 'issam123',
        options: {
            encrypt: false,
            trustServerCertificate: true,
            enableArithAbort: true,
            connectTimeout: 10000
        },
        connectionTimeout: 12000,
        requestTimeout: 20000
    };
    logToFile(`Connecting to MSSQL: ${dbConfig.server}:${dbConfig.port} / ${dbConfig.database} as User: ${dbConfig.user}`);
    try {
        pool = await new sql.ConnectionPool(dbConfig).connect();
        logToFile('Connected to MSSQL successfully');
        return pool;
    } catch (e: any) {
        logToFile(`MSSQL Connection error: ${e.message} (Code: ${e.code || 'UNKNOWN'})`);
        throw e;
    }
}

export async function closeDb(): Promise<void> {
    if (pool) { await pool.close(); pool = null; }
}

// Fast metadata update — only ensures metadata row exists, does NOT overwrite admin-set values
export async function dbUpdateMetadataOnly(sysInfo: { hostname: string; serialNumber: string }): Promise<boolean> {
    try {
        const db = await getPool();
        const config = getConfig();
        const { hostname, serialNumber } = sysInfo;

        logToFile(`DB Fast Metadata Sync: ${hostname} (${serialNumber}), category=${config.category}`);

        // Find machine by serial or hostname
        let result = await db.request()
            .input('serial', serialNumber)
            .input('host', hostname)
            .query('SELECT id FROM machines WHERE serial_number = @serial OR hostname = @host');

        const machineId = result.recordset[0]?.id;
        if (!machineId) {
            logToFile('Fast sync skipped: Machine not found in DB yet (normal for first run).');
            return false;
        }

        // v1.1.6: Only INSERT if no metadata row exists — never overwrite admin-set values
        const metaResult = await db.request()
            .input('mid', machineId)
            .query('SELECT 1 FROM machine_metadata WHERE machine_id = @mid');

        if (!metaResult.recordset[0]) {
            await db.request()
                .input('mid', machineId)
                .input('cat', config.category || 'Unassigned')
                .input('loc', config.location || null)
                .input('dept', config.department || null)
                .input('fam', config.family || null)
                .query('INSERT INTO machine_metadata (machine_id, category, location, department, family) VALUES (@mid, @cat, @loc, @dept, @fam)');
            logToFile('Fast sync: Metadata row created (first time).');
        } else {
            logToFile('Fast sync: Metadata row exists, preserving admin-set values.');
        }

        return true;
    } catch (err: any) {
        logToFile(`DB Fast Sync FAILED: ${err.message}`);
        return false;
    }
}

// Direct registration — mirrors server's /register logic
export async function dbRegisterAgent(sysInfo: any): Promise<{ machineId: string; agentId: string } | null> {
    try {
        const db = await getPool();
        const config = getConfig();
        const { hostname, serialNumber, osName, osVersion, osBuild, macAddresses, ipAddresses, cpu, totalMemoryGB, totalDiskGB, domain, vlanId, switchPort, switchName, switchIp, switchPlatform, currentUser } = sysInfo;

        logToFile(`DB Register: ${hostname} (${serialNumber}), category=${config.category}`);

        // Lookup existing machine
        let result = await db.request()
            .input('serial', serialNumber)
            .input('host', hostname)
            .query('SELECT * FROM machines WHERE serial_number = @serial OR hostname = @host');
        let machine = result.recordset[0];

        // Check by MAC if not found
        if (!machine && macAddresses && Array.isArray(macAddresses)) {
            for (const mac of macAddresses) {
                const nicResult = await db.request()
                    .input('mac', mac)
                    .query('SELECT machine_id FROM network_interfaces WHERE mac_address = @mac');
                if (nicResult.recordset[0]) {
                    const mResult = await db.request()
                        .input('id', nicResult.recordset[0].machine_id)
                        .query('SELECT * FROM machines WHERE id = @id');
                    machine = mResult.recordset[0];
                    if (machine) break;
                }
            }
        }

        const machineId = machine?.id || uuidv4();
        const agentId = machine?.agent_id || uuidv4();
        const effectiveCategory = config.category || 'Unassigned';

        if (machine) {
            // Update existing
            await db.request()
                .input('hostname', hostname)
                .input('serial', serialNumber)
                .input('agentId', agentId)
                .input('agentVersion', config.version)
                .input('osName', osName)
                .input('osVersion', osVersion)
                .input('osBuild', osBuild)
                .input('os', osName)
                .input('cpu', cpu)
                .input('ram', totalMemoryGB)
                .input('disk', totalDiskGB)
                .input('user', currentUser)
                .input('id', machineId)
                .query(`UPDATE machines SET
                    hostname = @hostname, serial_number = @serial, is_managed = 1,
                    agent_id = COALESCE(agent_id, @agentId), agent_version = @agentVersion,
                    os_name = @osName, os_version = @osVersion, os_build = @osBuild,
                    operating_system = @os, cpu = @cpu, ram_gb = @ram, disk_gb = @disk, [current_user] = @user,
                    last_heartbeat = GETUTCDATE(), last_seen = GETUTCDATE(), status = 'online'
                WHERE id = @id`);

            // v1.1.6: Server-as-source-of-truth — do NOT overwrite existing metadata on registration.
            // Only ensure a metadata row exists (INSERT if missing).
            const metaResult = await db.request()
                .input('mid', machineId)
                .query('SELECT * FROM machine_metadata WHERE machine_id = @mid');

            const existingMeta = metaResult.recordset[0];
            const finalTags = domain || existingMeta?.tags || null;

            if (!existingMeta) {
                // First-time metadata — use installer values
                const finalCategory = config.category || 'Unassigned';
                const tagsToSave = domain ? JSON.stringify([domain]) : null;
                await db.request()
                    .input('mid', machineId).input('cat', finalCategory)
                    .input('loc', config.location || null).input('dept', config.department || null)
                    .input('fam', config.family || null).input('tags', tagsToSave)
                    .query('INSERT INTO machine_metadata (machine_id, category, location, department, family, tags) VALUES (@mid, @cat, @loc, @dept, @fam, @tags)');
                logToFile(`Metadata INSERT (first time): Category=${finalCategory}, Location=${config.location}`);
            } else {
                // Existing machine — only update tags (domain), preserve admin-set metadata
                const tagsToSave = domain ? JSON.stringify([domain]) : existingMeta.tags;
                if (tagsToSave !== existingMeta.tags) {
                    await db.request()
                        .input('tags', tagsToSave).input('mid', machineId)
                        .query('UPDATE machine_metadata SET tags=@tags, updated_at=GETUTCDATE() WHERE machine_id=@mid');
                }
                logToFile(`Metadata PRESERVED (existing): Category=${existingMeta.category}, Location=${existingMeta.location}`);
            }
        } else {
            // Insert new machine
            await db.request()
                .input('id', machineId).input('hostname', hostname).input('serial', serialNumber)
                .input('agentId', agentId).input('agentVersion', config.version)
                .input('osName', osName).input('osVersion', osVersion).input('osBuild', osBuild)
                .input('os', osName).input('cpu', cpu).input('ram', totalMemoryGB).input('disk', totalDiskGB).input('user', currentUser)
                .query(`INSERT INTO machines (id, hostname, serial_number, is_managed, agent_id, agent_version, os_name, os_version, os_build, operating_system, cpu, ram_gb, disk_gb, [current_user], last_heartbeat, last_seen, status)
                    VALUES (@id, @hostname, @serial, 1, @agentId, @agentVersion, @osName, @osVersion, @osBuild, @os, @cpu, @ram, @disk, @user, GETUTCDATE(), GETUTCDATE(), 'online')`);

            const finalCategory = config.category || 'Unassigned';
            const tagsToSave = domain ? JSON.stringify([domain]) : null;
            await db.request()
                .input('mid', machineId).input('cat', finalCategory)
                .input('loc', config.location || null).input('dept', config.department || null)
                .input('fam', config.family || null).input('tags', tagsToSave)
                .query('INSERT INTO machine_metadata (machine_id, category, location, department, family, tags) VALUES (@mid, @cat, @loc, @dept, @fam, @tags)');
        }

        // Upsert network interfaces
        if (macAddresses && Array.isArray(macAddresses)) {
            for (let i = 0; i < macAddresses.length; i++) {
                const mac = macAddresses[i];
                const ip = ipAddresses?.[i] || null;
                const existingNic = await db.request()
                    .input('mid', machineId).input('mac', mac)
                    .query('SELECT id, vlan_id FROM network_interfaces WHERE machine_id = @mid AND mac_address = @mac');

                if (existingNic.recordset[0]) {
                    const existing = existingNic.recordset[0];
                    const isNewVlanGood = vlanId && !['Scanning...', '0 (Untagged)', 'N/A', 'Unknown', '0'].includes(vlanId);
                    const isExistingVlanBad = !existing.vlan_id || ['Scanning...', '0 (Untagged)', 'N/A', 'Unknown', '0'].includes(existing.vlan_id);

                    if (isNewVlanGood || isExistingVlanBad) {
                        await db.request().input('ip', ip).input('vlan', vlanId)
                            .input('port', sysInfo.switchPort).input('name', sysInfo.switchName)
                            .input('sip', sysInfo.switchIp).input('plat', sysInfo.switchPlatform)
                            .input('mid', machineId).input('mac', mac)
                            .query('UPDATE network_interfaces SET ip_address=@ip, vlan_id=@vlan, switch_port=@port, switch_name=@name, switch_ip=@sip, switch_platform=@plat, updated_at=GETUTCDATE() WHERE machine_id=@mid AND mac_address=@mac');
                    } else {
                        await db.request().input('ip', ip).input('mid', machineId).input('mac', mac)
                            .query('UPDATE network_interfaces SET ip_address=@ip, updated_at=GETUTCDATE() WHERE machine_id=@mid AND mac_address=@mac');
                    }
                } else {
                    await db.request()
                        .input('id', uuidv4()).input('mid', machineId).input('mac', mac)
                        .input('ip', ip).input('vlan', vlanId)
                        .input('port', sysInfo.switchPort).input('name', sysInfo.switchName)
                        .input('sip', sysInfo.switchIp).input('plat', sysInfo.switchPlatform)
                        .query("INSERT INTO network_interfaces (id, machine_id, mac_address, ip_address, vlan_id, switch_port, switch_name, switch_ip, switch_platform, mapping_source) VALUES (@id, @mid, @mac, @ip, @vlan, @port, @name, @sip, @plat, 'Agent')");
                }
            }
        }

        logToFile(`DB Registration success: machineId=${machineId}, agentId=${agentId}`);
        return { machineId, agentId };
    } catch (err: any) {
        logToFile(`DB Registration FAILED: ${err.message}`);
        return null;
    }
}

// Direct heartbeat — now returns metadata from DB for local sync
export async function dbSendHeartbeat(): Promise<{ category?: string; location?: string; department?: string; family?: string; active?: boolean; blockReason?: string } | boolean> {
    try {
        const db = await getPool();
        const config = getConfig();
        if (!config.agentId) return false;

        await db.request()
            .input('agentId', config.agentId)
            .query("UPDATE machines SET last_heartbeat = GETUTCDATE(), last_seen = GETUTCDATE(), status = 'online' WHERE agent_id = @agentId");

        // v1.1.6: Read back current metadata from DB for two-way sync
        // v1.1.7: Also read 'active' column for remote PC blocking
        const metaResult = await db.request()
            .input('agentId', config.agentId)
            .query(`SELECT mm.category, mm.location, mm.department, mm.family, m.active, m.block_reason
                    FROM machine_metadata mm
                    JOIN machines m ON m.id = mm.machine_id
                    WHERE m.agent_id = @agentId`);
        const meta = metaResult.recordset[0];
        if (meta) {
            return {
                category: meta.category,
                location: meta.location,
                department: meta.department,
                family: meta.family,
                active: meta.active !== undefined ? Boolean(meta.active) : true,
                blockReason: meta.block_reason || ''
            };
        }
        return true;
    } catch (err: any) {
        logToFile(`DB Heartbeat FAILED: ${err.message}`);
        return false;
    }
}

// Direct inventory
export async function dbSendInventory(sysInfo: any, installedApps: any[]): Promise<boolean> {
    try {
        const db = await getPool();
        const config = getConfig();
        if (!config.agentId) return false;

        // Get machine ID
        const machineResult = await db.request()
            .input('agentId', config.agentId)
            .query('SELECT id FROM machines WHERE agent_id = @agentId');
        const machine = machineResult.recordset[0];
        if (!machine) return false;

        const machineId = machine.id;

        // v1.0.88 FIX: Update OS info AND last_inventory timestamp (was missing before)
        await db.request()
            .input('osName', sysInfo.osName).input('osVersion', sysInfo.osVersion)
            .input('osBuild', sysInfo.osBuild).input('user', sysInfo.currentUser)
            .input('id', machineId)
            .query('UPDATE machines SET os_name=@osName, os_version=@osVersion, os_build=@osBuild, [current_user]=@user, last_seen=GETUTCDATE(), last_inventory=GETUTCDATE() WHERE id=@id');

        // v1.0.88 FIX: Wrap DELETE + INSERT in a transaction for atomicity
        const transaction = new sql.Transaction(db);
        await transaction.begin();
        try {
            await new sql.Request(transaction).input('mid', machineId).query('DELETE FROM installed_apps WHERE machine_id = @mid');

            for (const app of installedApps) {
                await new sql.Request(transaction)
                    .input('id', uuidv4()).input('mid', machineId)
                    .input('name', app.name).input('version', app.version || null)
                    .input('publisher', app.publisher || null).input('installDate', app.installDate || null)
                    .query('INSERT INTO installed_apps (id, machine_id, app_name, version, publisher, install_date) VALUES (@id, @mid, @name, @version, @publisher, @installDate)');
            }

            await transaction.commit();
        } catch (txErr: any) {
            await transaction.rollback();
            logToFile(`DB Inventory transaction FAILED (rolled back): ${txErr.message}`);
            return false;
        }

        logToFile(`DB Inventory success: ${installedApps.length} apps for ${machineId}`);

        // v1.0.88 FIX: Trigger compliance evaluation via HTTP (compliance logic is server-side)
        try {
            const { default: axios } = await import('axios');
            const https = await import('https');
            const serverUrl = config.serverUrl || 'https://localhost:3002/api';
            await axios.post(`${serverUrl}/agent/evaluate-compliance`, { agentId: config.agentId }, {
                headers: { 'x-api-key': config.apiKey || 'aptiv-agent-2025' },
                timeout: 15000,
                httpsAgent: new https.Agent({ rejectUnauthorized: false })
            });
            logToFile(`Compliance evaluation triggered for ${machineId}`);
        } catch (compErr: any) {
            logToFile(`Compliance trigger failed (non-fatal): ${compErr.message}`);
        }

        return true;
    } catch (err: any) {
        logToFile(`DB Inventory FAILED: ${err.message}`);
        return false;
    }
}

// v1.1.6: Fetch current metadata from DB for display in agent UI
// v1.1.7: Added 'active' status for PC blocking
// v1.1.8: Added 'block_reason' for PC blocking
export async function dbFetchMetadata(): Promise<{ category: string; location: string; department: string; family: string; active?: boolean; blockReason?: string } | null> {
    try {
        const db = await getPool();
        const config = getConfig();
        if (!config.agentId) return null;

        const result = await db.request()
            .input('agentId', config.agentId)
            .query(`SELECT mm.category, mm.location, mm.department, mm.family, m.active, m.block_reason
                    FROM machine_metadata mm
                    JOIN machines m ON m.id = mm.machine_id
                    WHERE m.agent_id = @agentId`);
        const meta = result.recordset[0];
        if (!meta) return null;
        return {
            category: meta.category || 'Unassigned',
            location: meta.location || '',
            department: meta.department || '',
            family: meta.family || '',
            active: meta.active !== undefined ? Boolean(meta.active) : true
        };
    } catch (err: any) {
        logToFile(`DB Fetch Metadata FAILED: ${err.message}`);
        return null;
    }
}

// v1.1.6: Update metadata from agent UI edit
export async function dbUpdateMetadata(data: { category: string; location: string; department: string; family: string }): Promise<boolean> {
    try {
        const db = await getPool();
        const config = getConfig();
        if (!config.agentId) return false;

        // Get machine ID
        const machineResult = await db.request()
            .input('agentId', config.agentId)
            .query('SELECT id FROM machines WHERE agent_id = @agentId');
        const machine = machineResult.recordset[0];
        if (!machine) return false;

        await db.request()
            .input('cat', data.category || 'Unassigned')
            .input('loc', data.location || null)
            .input('dept', data.department || null)
            .input('fam', data.family || null)
            .input('mid', machine.id)
            .query('UPDATE machine_metadata SET category=@cat, location=@loc, department=@dept, family=@fam, updated_at=GETUTCDATE() WHERE machine_id=@mid');

        logToFile(`DB Metadata updated from agent UI: Category=${data.category}, Location=${data.location}`);
        return true;
    } catch (err: any) {
        logToFile(`DB Update Metadata FAILED: ${err.message}`);
        return false;
    }
}

// v1.1.7: Explicitly update machine active status (used for local unblock)
export async function dbSetMachineActive(active: boolean): Promise<boolean> {
    try {
        const db = await getPool();
        const config = getConfig();
        if (!config.agentId) return false;

        const bitValue = active ? 1 : 0;
        await db.request()
            .input('agentId', config.agentId)
            .input('active', bitValue)
            .query('UPDATE machines SET active=@active, updated_at=GETUTCDATE() WHERE agent_id=@agentId');

        logToFile(`DB Machine Active Status updated: ${active}`);
        return true;
    } catch (err: any) {
        logToFile(`DB Set Machine Active FAILED: ${err.message}`);
        return false;
    }
}

// Fetch Info Page content directly from SQL
export async function dbFetchInfoPage(): Promise<any> {
    try {
        logToFile('DB Info Page: Connecting...');
        const db = await getPool();
        logToFile('DB Info Page: Connected. Running query...');
        const result = await db.request()
            .input('key', 'agent_info_page')
            .query('SELECT [value] FROM settings WHERE [key] = @key');
        
        logToFile(`DB Info Page: Query returned ${result.recordset.length} rows`);
        const setting = result.recordset[0];
        if (!setting) {
            logToFile('DB Info Page: No row found for key "agent_info_page"');
            return null;
        }
        
        const valuePreview = typeof setting.value === 'string' ? setting.value.substring(0, 100) : String(setting.value);
        logToFile(`DB Info Page: Found data (${valuePreview.length} chars preview): ${valuePreview}`);
        return { content: setting.value };
    } catch (err: any) {
        logToFile(`DB Fetch Info Page FAILED: ${err.message}`);
        return null;
    }
}



import { Router, Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { dbGet, dbAll, dbRun, runTransaction } from '../database/index.js';
import { createError } from '../middleware/errorHandler.js';
import { authenticateAgent } from '../middleware/auth.js';
import { config } from '../config.js';
import { evaluateMachineCompliance } from '../services/compliance.js';

const router = Router();

router.post('/register', authenticateAgent, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { hostname, serialNumber, agentVersion, osName, osVersion, osBuild, macAddresses, ipAddresses, cpu, totalMemoryGB, totalDiskGB, domain, vlanId, switchName, switchIp, switchPort, switchPlatform, currentUser, category, department, location, family } = req.body;
        console.log(`[AGENT-API] Registering machine: ${hostname} (${serialNumber}), Category: ${category}, Dept: ${department}, Loc: ${location}, Family: ${family}`);
        if (!hostname) throw createError('Hostname required', 400);

        let machine = await dbGet('SELECT * FROM machines WHERE serial_number = ? OR hostname = ?', [serialNumber, hostname]) as any;

        // If not found by serial/hostname, check if it was previously "Detected" via MAC
        if (!machine && macAddresses && Array.isArray(macAddresses)) {
            for (const mac of macAddresses) {
                const existingNic = await dbGet('SELECT machine_id FROM network_interfaces WHERE mac_address = ?', [mac]);
                if (existingNic) {
                    machine = await dbGet('SELECT * FROM machines WHERE id = ?', [existingNic.machine_id]);
                    if (machine) break;
                }
            }
        }

        const machineId = machine?.id || uuidv4();
        const agentId = machine?.agent_id || uuidv4();

        if (machine) {
            // Update existing record
            await dbRun(`
                UPDATE machines SET
                    hostname = ?,
                    serial_number = ?,
                    is_managed = 1,
                    agent_id = COALESCE(agent_id, ?),
                    agent_version = ?,
                    os_name = ?,
                    os_version = ?,
                    os_build = ?,
                    operating_system = ?,
                    cpu = ?,
                    ram_gb = ?,
                    disk_gb = ?,
                    [current_user] = ?,
                    last_heartbeat = GETUTCDATE(),
                    last_seen = GETUTCDATE(),
                    status = 'online'
                WHERE id = ? `,
                [hostname, serialNumber, agentId, agentVersion, osName, osVersion, osBuild, osName, cpu, totalMemoryGB, totalDiskGB, currentUser, machineId]
            );

            const metadata = await dbGet('SELECT * FROM machine_metadata WHERE machine_id = ?', [machineId]);

            // Logic: If the agent sends 'Unassigned' (default), but we already have a specific category, KEEP the specific one.
            // If the agent sends a SPECIAL category (User, Shopfloor, etc.), then OVERWRITE with the new one.
            const incomingCategory = (category && category !== 'Unassigned') ? category : null;
            const finalCategory = incomingCategory || metadata?.category || 'Unassigned';

            const finalLocation = location || metadata?.location || null;
            const finalDept = department || metadata?.department || null;
            const finalFamily = family || metadata?.family || null;
            const finalTags = domain || metadata?.tags || null;

            if (metadata) {
                await dbRun(`
                    UPDATE machine_metadata SET
                        category = ?,
                        location = ?,
                        department = ?,
                        family = ?,
                        tags = ?,
                        updated_at = GETUTCDATE()
                    WHERE machine_id = ?`,
                    [finalCategory, finalLocation, finalDept, finalFamily, finalTags, machineId]
                );
            } else {
                await dbRun("INSERT INTO machine_metadata (machine_id, category, location, department, family, tags) VALUES (?, ?, ?, ?, ?, ?)",
                    [machineId, finalCategory, finalLocation, finalDept, finalFamily, finalTags]);
            }
        } else {
            await dbRun("INSERT INTO machines (id, hostname, serial_number, is_managed, agent_id, agent_version, os_name, os_version, os_build, operating_system, cpu, ram_gb, disk_gb, [current_user], last_heartbeat, last_seen, status) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, GETUTCDATE(), GETUTCDATE(), 'online')",
                [machineId, hostname, serialNumber, agentId, agentVersion, osName, osVersion, osBuild, osName, cpu, totalMemoryGB, totalDiskGB, currentUser]);
            await dbRun("INSERT INTO machine_metadata (machine_id, category, location, department, family, tags) VALUES (?, ?, ?, ?, ?, ?)",
                [machineId, category || 'Unassigned', location || null, department || null, family || null, domain]);
        }

        if (macAddresses && Array.isArray(macAddresses)) {
            for (let i = 0; i < macAddresses.length; i++) {
                const mac = macAddresses[i], ip = ipAddresses?.[i] || null;
                const existing = await dbGet('SELECT id FROM network_interfaces WHERE machine_id = ? AND mac_address = ?', [machineId, mac]);

                // Assuming vlanId is sent as a single value for now, or we could expect an array matching macs?
                // For simplicity, applying the single detected vlanId to all interfaces or the first one?
                // Actually, vlan is per-interface. But system-info only sends lists. 
                // Let's assume vlanId passed is the "main" one or we need to update data structure.
                // For now, let's update vlan_id if it's passed.

                if (existing) {
                    // Defensive update: Only overwrite vlan_id if the new one is 'meaningful' 
                    // or if the existing one is null/placeholder.
                    const existingVlan = existing.vlan_id;
                    const isNewVlanGood = vlanId && !['Scanning...', '0 (Untagged)', 'N/A', 'Unknown', '0'].includes(vlanId);
                    const isExistingVlanBad = !existingVlan || ['Scanning...', '0 (Untagged)', 'N/A', 'Unknown', '0'].includes(existingVlan);

                    if (isNewVlanGood || isExistingVlanBad) {
                        await dbRun('UPDATE network_interfaces SET ip_address = ?, vlan_id = ?, switch_name = ?, switch_ip = ?, switch_port = ?, switch_platform = ?, updated_at = GETUTCDATE() WHERE machine_id = ? AND mac_address = ?', [ip, vlanId, switchName, switchIp, switchPort, switchPlatform, machineId, mac]);
                    } else {
                        await dbRun('UPDATE network_interfaces SET ip_address = ?, updated_at = GETUTCDATE() WHERE machine_id = ? AND mac_address = ?', [ip, machineId, mac]);
                    }
                } else {
                    await dbRun("INSERT INTO network_interfaces (id, machine_id, mac_address, ip_address, vlan_id, switch_name, switch_ip, switch_port, switch_platform, mapping_source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Agent')", [uuidv4(), machineId, mac, ip, vlanId, switchName, switchIp, switchPort, switchPlatform]);
                }
            }
        }

        res.json({ machineId, agentId, message: 'Registration successful', heartbeatInterval: config.heartbeatIntervalSeconds });
    } catch (error) { next(error); }
});

router.post('/heartbeat', authenticateAgent, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { agentId } = req.body;
        if (!agentId) throw createError('Agent ID required', 400);
        const result = await dbRun("UPDATE machines SET last_heartbeat = GETUTCDATE(), last_seen = GETUTCDATE(), status = 'online' WHERE agent_id = ?", [agentId]);
        if (result.changes === 0) throw createError('Agent not registered', 404);
        res.json({ status: 'ok', commands: [] });
    } catch (error) { next(error); }
});

router.post('/inventory', authenticateAgent, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { agentId, osName, osVersion, osBuild, installedApps, currentUser } = req.body;

        console.log(`[INVENTORY] Received payload for Agent: ${agentId} `);
        console.log(`[INVENTORY] App count: ${installedApps?.length} `);

        if (!agentId) throw createError('Agent ID required', 400);
        const machine = await dbGet('SELECT id FROM machines WHERE agent_id = ?', [agentId]) as any;
        if (!machine) {
            console.error(`[INVENTORY] Agent not found in DB: ${agentId} `);
            throw createError('Agent not registered', 404);
        }

        try {
            await runTransaction(async () => {
                await dbRun('UPDATE machines SET os_name = ?, os_version = ?, os_build = ?, [current_user] = ?, last_inventory = GETUTCDATE() WHERE id = ?', [osName, osVersion, osBuild, currentUser, machine.id]);

                if (installedApps && Array.isArray(installedApps)) {
                    const currentApps = await dbAll('SELECT * FROM installed_apps WHERE machine_id = ?', [machine.id]) as any[];
                    const currentMap = new Map(currentApps.map(a => [a.app_name, a]));

                    for (const app of installedApps) {
                        const current = currentMap.get(app.name);
                        if (!current) {
                            await dbRun('INSERT INTO installed_apps (id, machine_id, app_name, version, publisher, install_date) VALUES (?, ?, ?, ?, ?, ?)', [uuidv4(), machine.id, app.name, app.version, app.publisher, app.installDate]);
                            await dbRun("INSERT INTO app_events (id, machine_id, event_type, app_name, new_version, publisher) VALUES (?, ?, 'installed', ?, ?, ?)", [uuidv4(), machine.id, app.name, app.version, app.publisher]);
                        } else if (current.version !== app.version) {
                            await dbRun('UPDATE installed_apps SET version = ?, publisher = ?, install_date = ?, updated_at = GETUTCDATE() WHERE id = ?', [app.version, app.publisher, app.installDate, current.id]);
                            await dbRun("INSERT INTO app_events (id, machine_id, event_type, app_name, old_version, new_version, publisher) VALUES (?, ?, 'updated', ?, ?, ?, ?)", [uuidv4(), machine.id, app.name, current.version, app.version, app.publisher]);
                        }
                        currentMap.delete(app.name);
                    }

                    for (const [, app] of currentMap) {
                        await dbRun('DELETE FROM installed_apps WHERE id = ?', [app.id]);
                        await dbRun("INSERT INTO app_events (id, machine_id, event_type, app_name, old_version, publisher) VALUES (?, ?, 'uninstalled', ?, ?, ?)", [uuidv4(), machine.id, app.app_name, app.version, app.publisher]);
                    }
                }
            });
            console.log(`[INVENTORY] Successfully processed inventory for ${machine.id}`);

            // Evaluate compliance based on the new inventory
            await evaluateMachineCompliance(machine.id);

            res.json({ status: 'ok', message: 'Inventory updated' });
        } catch (err: any) {
            console.error('[INVENTORY ERROR]', err);
            require('fs').writeFileSync('C:\\Users\\ahhpks\\Documents\\App\\PFE PROJECT\\server\\manual_db_error.txt', JSON.stringify(err, null, 2) + "\n" + err.message + "\n" + err.stack);
            throw err;
        }
    } catch (error) { next(error); }
});

// v1.0.88: Trigger compliance evaluation (called by agent after DB-direct inventory)
router.post('/evaluate-compliance', authenticateAgent, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { agentId } = req.body;
        if (!agentId) throw createError('Agent ID required', 400);
        const machine = await dbGet('SELECT id FROM machines WHERE agent_id = ?', [agentId]) as any;
        if (!machine) throw createError('Agent not registered', 404);
        await evaluateMachineCompliance(machine.id);
        res.json({ status: 'ok', message: 'Compliance evaluated' });
    } catch (error) { next(error); }
});

// Get info page content for agent popup
router.get('/info-page', authenticateAgent, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const setting = await dbGet("SELECT [value] FROM settings WHERE [key] = 'agent_info_page'") as any;
        if (!setting) {
            return res.json({ content: null });
        }
        res.json({ content: setting.value });
    } catch (error) { next(error); }
});

export default router;

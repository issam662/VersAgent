import { Router, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { dbGet, dbAll, dbRun } from '../database/index.js';
import { createError } from '../middleware/errorHandler.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { logAudit } from '../middleware/audit.js';
import { config } from '../config.js';

const router = Router();

// Get all machines
router.get('/', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const { search, status, category, os, isManaged, archived = 'false', page = '1', limit = '50' } = req.query;

        let query = `
      SELECT m.*, mm.category, mm.location, mm.description, mm.tags, mm.department, mm.family
      FROM machines m
      LEFT JOIN machine_metadata mm ON m.id = mm.machine_id
      WHERE 1=1
    `;
        const params: any[] = [];

        if (archived !== 'true') query += ' AND (m.is_archived = 0 OR m.is_archived IS NULL)';
        if (search) {
            query += ` AND (
                m.hostname LIKE ? 
                OR m.serial_number LIKE ? 
                OR mm.location LIKE ?
                OR mm.family LIKE ?
                OR EXISTS (
                    SELECT 1 FROM network_interfaces ni 
                    WHERE ni.machine_id = m.id 
                    AND (ni.ip_address LIKE ? OR ni.mac_address LIKE ?)
                )
            )`;
            params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
        }
        if (status) {
            const thresholdMinutes = config.onlineThresholdMinutes || 2;
            if (status === 'online') {
                query += ` AND (
                    (m.is_managed = 1 AND m.last_heartbeat > DATEADD(minute, -${thresholdMinutes}, GETUTCDATE()))
                    OR (m.is_managed = 0 AND m.status = 'online')
                )`;
            } else if (status === 'offline') {
                query += ` AND m.offline_reason IS NULL AND (
                    (m.is_managed = 1 AND (m.last_heartbeat <= DATEADD(minute, -${thresholdMinutes}, GETUTCDATE()) OR m.last_heartbeat IS NULL))
                    OR (m.is_managed = 0 AND (m.status = 'offline' OR m.status IS NULL))
                )`;
            } else if (status === 'intervention') {
                query += ` AND m.offline_reason = 'intervention' AND (
                    (m.is_managed = 1 AND (m.last_heartbeat <= DATEADD(minute, -${thresholdMinutes}, GETUTCDATE()) OR m.last_heartbeat IS NULL))
                    OR (m.is_managed = 0 AND (m.status = 'offline' OR m.status IS NULL))
                )`;
            } else if (status === 'temporary') {
                query += ` AND m.offline_reason = 'temporary' AND (
                    (m.is_managed = 1 AND (m.last_heartbeat <= DATEADD(minute, -${thresholdMinutes}, GETUTCDATE()) OR m.last_heartbeat IS NULL))
                    OR (m.is_managed = 0 AND (m.status = 'offline' OR m.status IS NULL))
                )`;
            } else {
                query += ' AND m.status = ?';
                params.push(status);
            }
        }
        if (category) {
            query += ' AND mm.category = ?';
            params.push(category);
        }
        if (os) {
            query += ' AND m.operating_system LIKE ?';
            params.push(`%${os}%`);
        }
        if (isManaged === 'true') {
            query += ' AND m.is_managed = 1';
        }

        // Build COUNT query with the same WHERE conditions (before ORDER BY / OFFSET)
        let countQuery = `
      SELECT COUNT(*) as total
      FROM machines m
      LEFT JOIN machine_metadata mm ON m.id = mm.machine_id
      WHERE 1=1
    `;
        if (archived !== 'true') countQuery += ' AND (m.is_archived = 0 OR m.is_archived IS NULL)';
        if (search) {
            countQuery += ` AND (
                m.hostname LIKE ? 
                OR m.serial_number LIKE ? 
                OR mm.location LIKE ?
                OR mm.family LIKE ?
                OR EXISTS (
                    SELECT 1 FROM network_interfaces ni 
                    WHERE ni.machine_id = m.id 
                    AND (ni.ip_address LIKE ? OR ni.mac_address LIKE ?)
                )
            )`;
        }
        if (status) {
            const thresholdMinutes = config.onlineThresholdMinutes || 2;
            if (status === 'online') {
                countQuery += ` AND (
                    (m.is_managed = 1 AND m.last_heartbeat > DATEADD(minute, -${thresholdMinutes}, GETUTCDATE()))
                    OR (m.is_managed = 0 AND m.status = 'online')
                )`;
            } else if (status === 'offline') {
                countQuery += ` AND m.offline_reason IS NULL AND (
                    (m.is_managed = 1 AND (m.last_heartbeat <= DATEADD(minute, -${thresholdMinutes}, GETUTCDATE()) OR m.last_heartbeat IS NULL))
                    OR (m.is_managed = 0 AND (m.status = 'offline' OR m.status IS NULL))
                )`;
            } else if (status === 'intervention') {
                countQuery += ` AND m.offline_reason = 'intervention' AND (
                    (m.is_managed = 1 AND (m.last_heartbeat <= DATEADD(minute, -${thresholdMinutes}, GETUTCDATE()) OR m.last_heartbeat IS NULL))
                    OR (m.is_managed = 0 AND (m.status = 'offline' OR m.status IS NULL))
                )`;
            } else if (status === 'temporary') {
                countQuery += ` AND m.offline_reason = 'temporary' AND (
                    (m.is_managed = 1 AND (m.last_heartbeat <= DATEADD(minute, -${thresholdMinutes}, GETUTCDATE()) OR m.last_heartbeat IS NULL))
                    OR (m.is_managed = 0 AND (m.status = 'offline' OR m.status IS NULL))
                )`;
            } else {
                countQuery += ' AND m.status = ?';
            }
        }
        if (category) countQuery += ' AND mm.category = ?';
        if (os) countQuery += ' AND m.operating_system LIKE ?';
        if (isManaged === 'true') countQuery += ' AND m.is_managed = 1';

        query += ` ORDER BY
            CASE
                WHEN m.is_managed = 1 AND m.last_heartbeat > DATEADD(minute, -${config.onlineThresholdMinutes || 2}, GETUTCDATE()) THEN 0
                WHEN m.is_managed = 0 AND m.status = 'online' THEN 1
                ELSE 2
            END ASC,
            m.hostname ASC`;
        const offset = (parseInt(page as string) - 1) * parseInt(limit as string);
        query += ` OFFSET ${offset} ROWS FETCH NEXT ${parseInt(limit as string)} ROWS ONLY`;

        const machines = await dbAll(query, params) as any[];

        const enrichedMachines = await Promise.all(machines.map(async machine => {
            const nic = await dbGet(`
                SELECT TOP 1 ip_address, mac_address 
                FROM network_interfaces 
                WHERE machine_id = ? 
                ORDER BY 
                    CASE WHEN ip_address LIKE '10.%' THEN 0 ELSE 1 END ASC,
                    updated_at DESC
            `, [machine.id]) as any;

            // v1.0.61 FIX: Respect online threshold for managed machines
            let status = machine.status || 'offline';
            const thresholdMs = (config.onlineThresholdMinutes || 2) * 60 * 1000;
            const now = Date.now();

            if (machine.is_managed) {
                const lastHeartbeat = machine.last_heartbeat ? new Date(machine.last_heartbeat).getTime() : 0;
                status = (now - lastHeartbeat < thresholdMs) ? 'online' : 'offline';
            }

            // Calculate lastSeenType for display purposes only
            const hasHeartbeat = status === 'online' && machine.is_managed;
            const isRecentPing = !machine.is_managed && machine.last_seen && new Date(machine.last_seen).getTime() > (now - 15 * 60 * 1000);

            let lastSeenType: string | null = null;
            if (hasHeartbeat) lastSeenType = 'Heartbeat';
            else if (isRecentPing) lastSeenType = 'Ping';

            let parsedTags = [];
            try {
                parsedTags = machine.tags ? JSON.parse(machine.tags) : [];
                if (!Array.isArray(parsedTags)) {
                    parsedTags = [parsedTags];
                }
            } catch (e) {
                console.error(`Failed to parse tags for machine ${machine.id}:`, e);
                // Fallback: treat as single string if possible or empty array
                if (typeof machine.tags === 'string') {
                    parsedTags = [machine.tags];
                }
            }

            return {
                ...machine,
                isOnline: status === 'online',
                status,
                lastSeenType,
                lastKnownIp: nic?.ip_address || null,
                tags: parsedTags,
                // CamelCase mapping
                ramGb: machine.ram_gb,
                diskGb: machine.disk_gb,
                cpu: machine.cpu,
                lastHeartbeat: machine.last_heartbeat,
                createdAt: machine.created_at,
                updatedAt: machine.updated_at,
                macAddress: nic?.mac_address || null,
                ipAddress: nic?.ip_address || null,
                operatingSystem: machine.operating_system,
                isManaged: machine.is_managed,
                offlineReason: machine.offline_reason || null
            };
        }));

        // Sort after enrichment so we use the TRUE computed status (heartbeat threshold applied)
        // Tier 0: managed + online, Tier 1: unmanaged + online, Tier 2: offline (intervention/temp/plain)
        enrichedMachines.sort((a, b) => {
            const tier = (m: any) => {
                if (m.status === 'online' && m.is_managed) return 0;
                if (m.status === 'online' && !m.is_managed) return 1;
                // Offline family
                if (m.offline_reason === 'intervention') return 3;
                if (m.offline_reason === 'temporary') return 4;
                return 2;
            };
            const tDiff = tier(a) - tier(b);
            if (tDiff !== 0) return tDiff;
            return (a.hostname || '').localeCompare(b.hostname || '');
        });

        const totalResult = await dbGet(countQuery, params) as any;

        res.json({ machines: enrichedMachines, pagination: { page: parseInt(page as string), limit: parseInt(limit as string), total: totalResult?.total || 0 } });
    } catch (error) { next(error); }
});

// Get single machine
router.get('/:id', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        console.log(`[DEBUG] GET /machines/${id} - Start`);

        // 1. Simple Check
        const simpleMachine = await dbGet('SELECT * FROM machines WHERE id = ?', [id]);
        console.log(`[DEBUG] Simple Params Check:`, simpleMachine ? 'Found' : 'NOT FOUND');

        // 2. Full Query
        const machine = await dbGet(`SELECT m.*, mm.category, mm.location, mm.description, mm.tags, mm.notes, mm.department, mm.family FROM machines m LEFT JOIN machine_metadata mm ON m.id = mm.machine_id WHERE m.id = ?`, [id]) as any;
        console.log(`[DEBUG] Full Query Check:`, machine ? 'Found' : 'NOT FOUND');

        if (!machine) {
            console.error(`[DEBUG] Returning 404 for ID: ${id}`);
            throw createError('Machine not found', 404);
        }
        const nics = await dbAll(`
            SELECT * FROM network_interfaces 
            WHERE machine_id = ? 
            ORDER BY 
                CASE WHEN ip_address LIKE '10.%' THEN 0 ELSE 1 END ASC,
                updated_at DESC
        `, [id]);
        const apps = await dbAll('SELECT * FROM installed_apps WHERE machine_id = ? ORDER BY app_name', [id]);
        const events = await dbAll('SELECT TOP 50 * FROM app_events WHERE machine_id = ? ORDER BY timestamp DESC', [id]);

        // Fetch latest scan result if we have an IP or MAC
        let lastScan = null;
        if (nics.length > 0) {
            const nic = nics[0];
            // Try IP first, then MAC
            if (nic.ip_address) {
                lastScan = await dbGet('SELECT TOP 1 * FROM scan_results WHERE ip = ? ORDER BY scanned_at DESC', [nic.ip_address]);
            }
            if (!lastScan && nic.mac_address) {
                lastScan = await dbGet('SELECT TOP 1 * FROM scan_results WHERE mac_address = ? ORDER BY scanned_at DESC', [nic.mac_address]);
            }

            if (lastScan) {
                try {
                    lastScan.open_ports = JSON.parse(lastScan.open_ports || '[]');
                } catch (e) {
                    console.error(`[DEBUG] Failed to parse open_ports for machine ${id}:`, e);
                    lastScan.open_ports = [];
                }
                try {
                    lastScan.vulnerabilities = JSON.parse(lastScan.vulnerabilities || '[]');
                } catch (e) {
                    console.error(`[DEBUG] Failed to parse vulnerabilities for machine ${id}:`, e);
                    lastScan.vulnerabilities = [];
                }
            }
        }

        let parsedTags = [];
        try {
            parsedTags = machine.tags ? JSON.parse(machine.tags) : [];
            if (!Array.isArray(parsedTags)) {
                parsedTags = [parsedTags];
            }
        } catch (e) {
            console.error(`[DEBUG] Failed to parse tags for machine ${id}:`, e);
            // Fallback: treat as single string if possible or empty array
            if (typeof machine.tags === 'string') {
                parsedTags = [machine.tags];
            }
        }

        // Calculate correct online status respecting threshold
        let status = machine.status || 'offline';
        const thresholdMs = (config.onlineThresholdMinutes || 2) * 60 * 1000;
        const now = Date.now();

        if (machine.is_managed) {
            const lastHeartbeat = machine.last_heartbeat ? new Date(machine.last_heartbeat).getTime() : 0;
            status = (now - lastHeartbeat < thresholdMs) ? 'online' : 'offline';
        }

        res.json({
            ...machine,
            isOnline: status === 'online',
            status,
            lastSeenType: machine.lastSeenType,
            tags: parsedTags,
            networkInterfaces: nics,
            installedApps: apps,
            events,
            lastScan,
            // CamelCase mapping
            ramGb: machine.ram_gb,
            diskGb: machine.disk_gb,
            cpu: machine.cpu,
            lastHeartbeat: machine.last_heartbeat,
            createdAt: machine.created_at,
            updatedAt: machine.updated_at,
            operatingSystem: machine.operating_system,
            isManaged: machine.is_managed,
            macAddress: nics[0]?.mac_address || null,
            ipAddress: nics[0]?.ip_address || null,
            vlanId: nics[0]?.vlan_id || 'N/A',
            vlan_id: nics[0]?.vlan_id || 'N/A',
            switch_name: nics[0]?.switch_name || null,
            switch_port: nics[0]?.switch_port || null,
            switch_ip: nics[0]?.switch_ip || null,
            switch_platform: nics[0]?.switch_platform || null
        });
    } catch (error) { next(error); }
});

// Create unmanaged machine
router.post('/', authenticate, authorize('SuperAdmin', 'Admin'), async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        let { hostname, serialNumber, ipAddress, macAddress, operatingSystem, category, location, description, tags, notes, department, family } = req.body;
        
        if (!hostname && !ipAddress) {
            throw createError('Hostname or IP Address is required', 400);
        }

        // Use IP as fallback for hostname if missing
        if (!hostname) {
            hostname = ipAddress;
        }
        
        // Check if machine already exists by IP or MAC
        let existingMachine = null;
        if (macAddress && macAddress.toLowerCase() !== 'unknown') {
            const nic = await dbGet('SELECT machine_id FROM network_interfaces WHERE mac_address = ?', [macAddress]);
            if (nic) {
                existingMachine = await dbGet('SELECT * FROM machines WHERE id = ?', [nic.machine_id]);
            }
        }
        
        if (!existingMachine && ipAddress) {
            const nic = await dbGet('SELECT machine_id FROM network_interfaces WHERE ip_address = ?', [ipAddress]);
            if (nic) {
                existingMachine = await dbGet('SELECT * FROM machines WHERE id = ?', [nic.machine_id]);
            }
        }

        if (existingMachine) {
            // Update existing instead of failing
            await dbRun(
                'UPDATE machines SET hostname = COALESCE(?, hostname), serial_number = COALESCE(?, serial_number), operating_system = COALESCE(?, operating_system), is_managed = 0, status = ? WHERE id = ?',
                [hostname, serialNumber || null, operatingSystem || null, existingMachine.status || 'offline', existingMachine.id]
            );
            
            // Update metadata
            const existingMeta = await dbGet('SELECT machine_id FROM machine_metadata WHERE machine_id = ?', [existingMachine.id]);
            if (existingMeta) {
                await dbRun(
                    'UPDATE machine_metadata SET category = ?, location = ?, description = ?, tags = ?, notes = ?, department = ?, family = ?, updated_at = GETUTCDATE() WHERE machine_id = ?',
                    [category || 'User', location || null, description || null, tags ? JSON.stringify(tags) : null, notes || null, department || null, family || null, existingMachine.id]
                );
            } else {
                await dbRun(
                    'INSERT INTO machine_metadata (machine_id, category, location, description, tags, notes, department, family) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                    [existingMachine.id, category || 'User', location || null, description || null, tags ? JSON.stringify(tags) : null, notes || null, department || null, family || null]
                );
            }

            return res.json({ id: existingMachine.id, message: 'Machine updated successfully' });
        }

        const machineId = uuidv4();
        
        // Treat "unknown" (from scanner) or empty as missing to generate a unique fallback
        const isMacMissing = !macAddress || macAddress.toLowerCase() === 'unknown' || macAddress.trim() === '';
        const mac = isMacMissing ? `manual-${uuidv4().substring(0, 8)}` : macAddress;

        await dbRun(
            "INSERT INTO machines (id, hostname, serial_number, operating_system, is_managed, status) VALUES (?, ?, ?, ?, 0, 'offline')", 
            [machineId, hostname, serialNumber || null, operatingSystem || null]
        );
        
        await dbRun(
            'INSERT INTO machine_metadata (machine_id, category, location, description, tags, notes, department, family) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', 
            [machineId, category || 'User', location || null, description || null, tags ? JSON.stringify(tags) : null, notes || null, department || null, family || null]
        );

        if (ipAddress) {
            await dbRun(
                "INSERT INTO network_interfaces (id, machine_id, mac_address, ip_address, mapping_source) VALUES (?, ?, ?, ?, 'Manual')", 
                [uuidv4(), machineId, mac, ipAddress]
            );
        }

        await logAudit(req.user?.id || null, req.user?.username || '', `Added new machine: ${hostname}`, 'machine', machineId, null, { hostname, ipAddress, macAddress: mac }, req.ip || '', req.headers['user-agent'] as string || '');
        
        res.status(201).json({ id: machineId, message: 'Machine created successfully' });
    } catch (error) { 
        console.error('Failed to create machine:', error);
        next(error); 
    }
});

// Update machine
router.put('/:id', authenticate, authorize('SuperAdmin', 'Admin'), async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const { hostname, category, location, description, tags, notes, department, family } = req.body;
        
        const machine = await dbGet('SELECT hostname, is_managed FROM machines WHERE id = ?', [id]) as any;
        if (!machine) throw createError('Machine not found', 404);

        // Update hostname only if it's an unmanaged machine
        if (hostname && (machine.is_managed === false || machine.is_managed === 0)) {
            await dbRun('UPDATE machines SET hostname = ?, updated_at = GETUTCDATE() WHERE id = ?', [hostname, id]);
        }

        const existing = await dbGet('SELECT machine_id FROM machine_metadata WHERE machine_id = ?', [id]);
        if (existing) {
            await dbRun('UPDATE machine_metadata SET category = ?, location = ?, description = ?, tags = ?, notes = ?, department = ?, family = ?, updated_at = GETUTCDATE() WHERE machine_id = ?', [category, location, description, tags ? JSON.stringify(tags) : null, notes, department || null, family || null, id]);
        } else {
            await dbRun('INSERT INTO machine_metadata (machine_id, category, location, description, tags, notes, department, family) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [id, category, location, description, tags ? JSON.stringify(tags) : null, notes, department || null, family || null]);
        }
        
        await logAudit(req.user?.id || null, req.user?.username || '', `Updated machine configuration: ${hostname || machine.hostname}`, 'machine', id, null, req.body, req.ip || '', req.headers['user-agent'] as string || '');
        res.json({ message: 'Machine updated' });
    } catch (error) { next(error); }
});

// Block/Unblock machine
router.put('/:id/block', authenticate, authorize('SuperAdmin', 'Admin'), async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const { active, reason } = req.body;
        
        await dbRun('UPDATE machines SET active = ?, block_reason = ? WHERE id = ?', [active ? 1 : 0, reason || null, id]);
        const machine = await dbGet('SELECT hostname FROM machines WHERE id = ?', [id]) as any;
        
        await logAudit(
            req.user?.id || null, 
            req.user?.username || '', 
            `${active ? 'Unlocked' : 'Blocked'} machine: ${machine?.hostname || id}`, 
            'machine', 
            id, 
            null, 
            { active, reason }, 
            req.ip || '', 
            req.headers['user-agent'] as string || ''
        );
        
        res.json({ message: active ? 'Machine unlocked successfully' : 'Machine blocked successfully' });
    } catch (error) { next(error); }
});

// Archive/Unarchive
router.post('/:id/archive', authenticate, authorize('SuperAdmin', 'Admin'), async (req: AuthRequest, res: Response, next: NextFunction) => {
    try { const m = await dbGet('SELECT hostname FROM machines WHERE id = ?', [req.params.id]) as any; await dbRun('UPDATE machines SET is_archived = 1 WHERE id = ?', [req.params.id]); await logAudit(req.user?.id || null, req.user?.username || '', `Archived machine: ${m?.hostname || req.params.id}`, 'machine', req.params.id, null, null, req.ip || '', req.headers['user-agent'] as string || ''); res.json({ message: 'Archived' }); } catch (error) { next(error); }
});

router.post('/:id/unarchive', authenticate, authorize('SuperAdmin', 'Admin'), async (req: AuthRequest, res: Response, next: NextFunction) => {
    try { await dbRun('UPDATE machines SET is_archived = 0 WHERE id = ?', [req.params.id]); res.json({ message: 'Unarchived' }); } catch (error) { next(error); }
});

router.post('/:id/refresh', authenticate, authorize('SuperAdmin', 'Admin'), async (req: AuthRequest, res: Response, next: NextFunction) => {
    try { const m = await dbGet('SELECT hostname FROM machines WHERE id = ?', [req.params.id]) as any; await logAudit(req.user?.id || null, req.user?.username || '', `Requested data refresh for machine: ${m?.hostname || req.params.id}`, 'machine', req.params.id, null, null, req.ip || '', req.headers['user-agent'] as string || ''); res.json({ message: 'Refresh command sent' }); } catch (error) { next(error); }
});

router.delete('/:id', authenticate, authorize('SuperAdmin'), async (req: AuthRequest, res: Response, next: NextFunction) => {
    try { const m = await dbGet('SELECT hostname FROM machines WHERE id = ?', [req.params.id]) as any; await dbRun('DELETE FROM machines WHERE id = ?', [req.params.id]); await logAudit(req.user?.id || null, req.user?.username || '', `Deleted machine: ${m?.hostname || 'Unknown'}`, 'machine', req.params.id, m, null, req.ip || '', req.headers['user-agent'] as string || ''); res.json({ message: 'Deleted' }); } catch (error) { next(error); }
});

// Set offline reason (Intervention / Temporary Offline)
router.patch('/:id/offline-reason', authenticate, authorize('SuperAdmin', 'Admin'), async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;

        const allowed = ['intervention', 'temporary', null];
        if (!allowed.includes(reason)) {
            throw createError('Invalid offline reason. Must be "intervention", "temporary", or null.', 400);
        }

        const machine = await dbGet('SELECT hostname FROM machines WHERE id = ?', [id]) as any;
        if (!machine) throw createError('Machine not found', 404);

        await dbRun('UPDATE machines SET offline_reason = ? WHERE id = ?', [reason || null, id]);

        const reasonLabel = reason === 'intervention' ? 'Intervention' : reason === 'temporary' ? 'Temporary Offline' : 'No reason (plain offline)';
        await logAudit(
            req.user?.id || null,
            req.user?.username || '',
            `Set offline reason for machine ${machine.hostname}: ${reasonLabel}`,
            'machine',
            id,
            null,
            { reason },
            req.ip || '',
            req.headers['user-agent'] as string || ''
        );

        res.json({ message: 'Offline reason updated', reason: reason || null });
    } catch (error) { next(error); }
});

// Get machine apps
router.get('/:id/apps', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const apps = await dbAll('SELECT app_name as name, version, publisher, install_date as installDate FROM installed_apps WHERE machine_id = ? ORDER BY app_name', [id]);
        res.json({ apps });
    } catch (error) { next(error); }
});

// Get machine compliance
router.get('/:id/compliance', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const violations = await dbAll(`
            SELECT cr.*, r.name as rule_name, r.severity, r.description as rule_description, r.rule_type
            FROM compliance_results cr
            JOIN compliance_rules r ON cr.rule_id = r.id
            WHERE cr.machine_id = ? AND cr.status = 'Non-Compliant'
        `, [id]);
        res.json({ violations });
    } catch (error) { next(error); }
});

export default router;

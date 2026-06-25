import { Router, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { dbAll, dbRun, dbGet } from '../database/index.js';
import { scanNetwork, getScanStatus, stopScan, ping } from '../services/scanner.js';

const router = Router();

// Get scan status
router.get('/status', authenticate, (req, res) => {
    res.json(getScanStatus());
});

// Stop scan
router.post('/stop', authenticate, authorize('SuperAdmin', 'Admin'), (req, res) => {
    stopScan();
    res.json({ message: 'Stopping scan...' });
});

// Get scan results
router.get('/', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const results = await dbAll('SELECT * FROM scan_results ORDER BY scanned_at DESC');

        // Enrich with registration status
        const enrichedResults = await Promise.all(results.map(async (result) => {
            // Check if IP or MAC exists in network_interfaces
            const existingNic = await dbAll(
                'SELECT machine_id FROM network_interfaces WHERE ip_address = ? OR mac_address = ?',
                [result.ip, result.mac_address]
            );

            return {
                ...result,
                is_registered: existingNic.length > 0,
                machine_id: existingNic.length > 0 ? existingNic[0].machine_id : null,
                open_ports: JSON.parse(result.open_ports || '[]'),
                vulnerabilities: JSON.parse(result.vulnerabilities || '[]')
            };
        }));

        res.json({ results: enrichedResults });
    } catch (error) {
        next(error);
    }
});

// Clear scan results
router.delete('/', authenticate, authorize('SuperAdmin', 'Admin'), async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        await dbRun('DELETE FROM scan_results');
        res.json({ message: 'Scan results cleared' });
    } catch (error) {
        next(error);
    }
});

// Start a scan
router.post('/', authenticate, authorize('SuperAdmin', 'Admin'), async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const { cidr } = req.body;
        if (!cidr) {
            return res.status(400).json({ message: 'CIDR range is required' });
        }

        if (cidr.includes('/')) {
            // Run scan in background (fire and forget)
            scanNetwork(cidr).catch(err => console.error('Scan failed:', err));
            res.json({ message: 'Scan started in background' });
        } else {
            // Single IP: Wait for it
            const result = await scanNetwork(cidr);
            res.json({
                message: result ? 'Scan complete' : 'Scan complete. Host unreachable.',
                found: !!result,
                result
            });
        }
    } catch (error) {
        next(error);
    }
});

// Ping all unmanaged machines
router.post('/ping-unmanaged', authenticate, authorize('SuperAdmin', 'Admin'), async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const unmanaged = await dbAll('SELECT m.id, ni.ip_address FROM machines m JOIN network_interfaces ni ON m.id = ni.machine_id WHERE m.is_managed = 0 AND ni.ip_address IS NOT NULL');

        const BATCH_SIZE = 10;
        let successCount = 0;

        // Process in batches to avoid overwhelming the server
        for (let i = 0; i < unmanaged.length; i += BATCH_SIZE) {
            const chunk = unmanaged.slice(i, i + BATCH_SIZE);
            const promises = chunk.map(async (m: any) => {
                const isAlive = await ping(m.ip_address);
                if (isAlive) {
                    await dbRun("UPDATE machines SET last_seen = GETUTCDATE(), status = 'online' WHERE id = ?", [m.id]);
                    successCount++;
                } else {
                    await dbRun("UPDATE machines SET status = 'offline' WHERE id = ?", [m.id]);
                }
            });
            await Promise.all(promises);
        }

        res.json({ message: `Ping complete. ${successCount} machines were reachable.`, reachable: successCount, total: unmanaged.length });
    } catch (error) {
        next(error);
    }
});

// Register all scanned results that aren't registered
router.post('/register-all', authenticate, authorize('SuperAdmin', 'Admin'), async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const results = await dbAll('SELECT * FROM scan_results');
        let count = 0;

        for (const result of results) {
            // Check if already registered
            const existing = await dbGet('SELECT machine_id FROM network_interfaces WHERE ip_address = ? OR mac_address = ?', [result.ip, result.mac_address]);

            if (!existing) {
                const machineId = uuidv4();
                
                // Handle unknown MACs to avoid unique constraint collisions
                const isMacMissing = !result.mac_address || result.mac_address.toLowerCase() === 'unknown' || result.mac_address.trim() === '';
                const mac = isMacMissing ? `manual-${uuidv4().substring(0, 8)}` : result.mac_address;

                await dbRun("INSERT INTO machines (id, hostname, is_managed, last_seen, status) VALUES (?, ?, 0, GETUTCDATE(), 'offline')", [machineId, result.hostname || `Device-${result.ip}`]);
                await dbRun("INSERT INTO machine_metadata (machine_id, category) VALUES (?, 'Unassigned')", [machineId]);
                await dbRun("INSERT INTO network_interfaces (id, machine_id, mac_address, ip_address, mapping_source) VALUES (?, ?, ?, ?, 'Scan')", [uuidv4(), machineId, mac, result.ip]);
                count++;
            }
        }

        res.json({ message: `Successfully added ${count} machines to inventory.` });
    } catch (error) {
        next(error);
    }
});

export default router;

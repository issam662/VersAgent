import { Router, Response, NextFunction } from 'express';
import { dbGet, dbRun, dbAll } from '../database/index.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { logAudit } from '../middleware/audit.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// ─── Get all floors ───
router.get('/floors', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const floors = await dbAll('SELECT * FROM layout_floors ORDER BY floor_order ASC', []);
        res.json({ floors });
    } catch (error) {
        next(error);
    }
});

// ─── Get all devices on a floor ───
router.get('/floors/:id/devices', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const devices = await dbAll('SELECT * FROM layout_devices WHERE floor_id = ?', [id]);
        res.json({ devices });
    } catch (error) {
        next(error);
    }
});

// ─── Place a new device ───
router.post('/devices', authenticate, authorize('SuperAdmin', 'Admin'), async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const { floorId, deviceType, name, ipAddress, parentRackId, printerId, switchName, posX, posY, status } = req.body;

        if (!floorId || !deviceType) {
            return res.status(400).json({ error: 'floorId and deviceType are required' });
        }

        const id = uuidv4();
        await dbRun(
            `INSERT INTO layout_devices (id, floor_id, device_type, name, ip_address, parent_rack_id, printer_id, switch_name, pos_x, pos_y, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, floorId, deviceType, name || null, ipAddress || null, parentRackId || null, printerId || null, switchName || null, posX || 0, posY || 0, status || 'offline']
        );

        const device = await dbGet('SELECT * FROM layout_devices WHERE id = ?', [id]);

        await logAudit(
            req.user?.id || null, req.user?.username || '',
            `Placed ${deviceType} device: ${name || id}`, 'layout_device', id,
            null, device, req.ip || '', req.headers['user-agent'] as string || ''
        );

        res.status(201).json(device);
    } catch (error) {
        next(error);
    }
});

// ─── Update device (full) ───
router.put('/devices/:id', authenticate, authorize('SuperAdmin', 'Admin'), async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const { name, ipAddress, parentRackId, printerId, switchName, posX, posY, status } = req.body;

        const existing = await dbGet('SELECT * FROM layout_devices WHERE id = ?', [id]);
        if (!existing) return res.status(404).json({ error: 'Device not found' });

        await dbRun(
            `UPDATE layout_devices SET
                name = COALESCE(?, name),
                ip_address = COALESCE(?, ip_address),
                parent_rack_id = ?,
                printer_id = ?,
                switch_name = ?,
                pos_x = COALESCE(?, pos_x),
                pos_y = COALESCE(?, pos_y),
                status = COALESCE(?, status),
                updated_at = GETUTCDATE()
             WHERE id = ?`,
            [name, ipAddress, parentRackId !== undefined ? parentRackId : existing.parent_rack_id, printerId !== undefined ? printerId : existing.printer_id, switchName !== undefined ? switchName : existing.switch_name, posX, posY, status, id]
        );

        const updated = await dbGet('SELECT * FROM layout_devices WHERE id = ?', [id]);

        await logAudit(
            req.user?.id || null, req.user?.username || '',
            `Updated layout device: ${updated.name || id}`, 'layout_device', id,
            existing, updated, req.ip || '', req.headers['user-agent'] as string || ''
        );

        res.json(updated);
    } catch (error) {
        next(error);
    }
});

// ─── Quick position update (drag) ───
router.put('/devices/:id/position', authenticate, authorize('SuperAdmin', 'Admin'), async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const { posX, posY } = req.body;

        if (posX === undefined || posY === undefined) {
            return res.status(400).json({ error: 'posX and posY are required' });
        }

        const existing = await dbGet('SELECT * FROM layout_devices WHERE id = ?', [id]);
        if (!existing) return res.status(404).json({ error: 'Device not found' });

        await dbRun(
            'UPDATE layout_devices SET pos_x = ?, pos_y = ?, updated_at = GETUTCDATE() WHERE id = ?',
            [posX, posY, id]
        );

        res.json({ message: 'Position updated', id, posX, posY });
    } catch (error) {
        next(error);
    }
});

// ─── Delete device ───
router.delete('/devices/:id', authenticate, authorize('SuperAdmin', 'Admin'), async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;

        const existing = await dbGet('SELECT * FROM layout_devices WHERE id = ?', [id]);
        if (!existing) return res.status(404).json({ error: 'Device not found' });

        await dbRun('DELETE FROM layout_devices WHERE id = ?', [id]);

        await logAudit(
            req.user?.id || null, req.user?.username || '',
            `Removed layout device: ${existing.name || id}`, 'layout_device', id,
            existing, null, req.ip || '', req.headers['user-agent'] as string || ''
        );

        res.json({ message: 'Device removed' });
    } catch (error) {
        next(error);
    }
});

// ─── Get unplaced printers ───
router.get('/unplaced-printers', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const printers = await dbAll(
            `SELECT p.* FROM printers p
             WHERE p.id NOT IN (SELECT ISNULL(printer_id, '') FROM layout_devices WHERE device_type = 'printer' AND printer_id IS NOT NULL)
             ORDER BY p.ip_address`,
            []
        );
        res.json({ printers });
    } catch (error) {
        next(error);
    }
});

// ─── Ping a single device ───
router.post('/devices/:id/ping', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const device = await dbGet('SELECT * FROM layout_devices WHERE id = ?', [id]);
        if (!device) return res.status(404).json({ error: 'Device not found' });
        if (!device.ip_address) return res.json({ id, status: 'offline', message: 'No IP address configured' });

        const { exec } = await import('child_process');
        const isOnline = await new Promise<boolean>((resolve) => {
            exec(`ping -n 1 -w 1500 ${device.ip_address}`, (error, stdout) => {
                resolve(!error && stdout.includes('TTL='));
            });
        });

        const status = isOnline ? 'online' : 'offline';
        await dbRun('UPDATE layout_devices SET status = ?, updated_at = GETUTCDATE() WHERE id = ?', [status, id]);

        res.json({ id, status, ip_address: device.ip_address });
    } catch (error) {
        next(error);
    }
});

// ─── Batch ping all devices on a floor ───
router.post('/floors/:id/ping', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const devices = await dbAll('SELECT * FROM layout_devices WHERE floor_id = ? AND ip_address IS NOT NULL', [id]);

        const { exec } = await import('child_process');
        
        const results: { id: string; status: string }[] = [];
        const CONCURRENCY_LIMIT = 10;

        for (let i = 0; i < devices.length; i += CONCURRENCY_LIMIT) {
            const chunk = devices.slice(i, i + CONCURRENCY_LIMIT);
            const chunkResults = await Promise.all(
                chunk.map((device: any) =>
                    new Promise<{ id: string; status: string }>((resolve) => {
                        exec(`ping -n 1 -w 1500 ${device.ip_address}`, (error: any, stdout: string) => {
                            const status = (!error && stdout.includes('TTL=')) ? 'online' : 'offline';
                            dbRun('UPDATE layout_devices SET status = ?, updated_at = GETUTCDATE() WHERE id = ?', [status, device.id])
                                .then(() => resolve({ id: device.id, status }))
                                .catch(() => resolve({ id: device.id, status: 'offline' }));
                        });
                    })
                )
            );
            results.push(...chunkResults);
        }

        res.json({ results });
    } catch (error) {
        next(error);
    }
});

export default router;

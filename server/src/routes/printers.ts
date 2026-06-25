import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { dbAll, dbRun, dbGet } from '../database/index.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const router = express.Router();
const execAsync = promisify(exec);

export interface Printer {
    id: string;
    ip_address: string;
    category: string;
    department: string;
    mac_address: string;
    serial_number: string;
    hostname: string;
    model: string;
    queue_name: string;
    station_name: string;
    line: string;
    comment: string;
    custom_website_url: string;
    created_at?: string;
    updated_at?: string;
}

// Get all printers
router.get('/', authenticate, authorize('SuperAdmin', 'Admin', 'Viewer'), async (req, res) => {
    try {
        const printers = await dbAll("SELECT * FROM printers ORDER BY ISNULL(department, 'zzzz'), ip_address");
        res.json(printers);
    } catch (err) {
        console.error('Failed to get printers:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get a single printer
router.get('/:id', authenticate, authorize('SuperAdmin', 'Admin', 'Viewer'), async (req, res) => {
    try {
        const printer = await dbGet('SELECT * FROM printers WHERE id = ?', [req.params.id]);
        if (!printer) {
            return res.status(404).json({ error: 'Printer not found' });
        }
        res.json(printer);
    } catch (err) {
        console.error('Failed to get printer:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Create a new printer
router.post('/', authenticate, authorize('SuperAdmin', 'Admin'), async (req, res) => {
    try {
        const p: Partial<Printer> = req.body;

        if (!p.ip_address) {
            return res.status(400).json({ error: 'IP Address is required' });
        }

        const id = uuidv4();
        await dbRun(`
            INSERT INTO printers (
                id, ip_address, category, department, mac_address, 
                serial_number, hostname, model, queue_name, station_name, line, comment, custom_website_url
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            id, p.ip_address, p.category || 'Printer', p.department || null, p.mac_address || null,
            p.serial_number || null, p.hostname || null, p.model || null, p.queue_name || null,
            p.station_name || null, p.line || null, p.comment || null, p.custom_website_url || null
        ]);

        const newPrinter = await dbGet('SELECT * FROM printers WHERE id = ?', [id]);
        res.status(201).json(newPrinter);
    } catch (err) {
        console.error('Failed to create printer:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update a printer
router.put('/:id', authenticate, authorize('SuperAdmin', 'Admin'), async (req, res) => {
    try {
        const p: Partial<Printer> = req.body;

        if (!p.ip_address) {
            return res.status(400).json({ error: 'IP Address is required' });
        }

        const existing = await dbGet('SELECT id FROM printers WHERE id = ?', [req.params.id]);
        if (!existing) {
            return res.status(404).json({ error: 'Printer not found' });
        }

        await dbRun(`
            UPDATE printers SET 
                ip_address = ?, category = ?, department = ?, mac_address = ?, 
                serial_number = ?, hostname = ?, model = ?, queue_name = ?, 
                station_name = ?, line = ?, comment = ?, custom_website_url = ?, updated_at = GETDATE()
            WHERE id = ?
        `, [
            p.ip_address, p.category || 'Printer', p.department || null, p.mac_address || null,
            p.serial_number || null, p.hostname || null, p.model || null, p.queue_name || null,
            p.station_name || null, p.line || null, p.comment || null, p.custom_website_url || null, req.params.id
        ]);

        const updated = await dbGet('SELECT * FROM printers WHERE id = ?', [req.params.id]);
        res.json(updated);
    } catch (err) {
        console.error('Failed to update printer:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Quick update category
router.put('/:id/category', authenticate, authorize('SuperAdmin', 'Admin'), async (req, res) => {
    try {
        const { category } = req.body;
        await dbRun('UPDATE printers SET category = ?, updated_at = GETDATE() WHERE id = ?', [category, req.params.id]);
        res.json({ success: true });
    } catch (err) {
        console.error('Failed to update printer category:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Quick update department
router.put('/:id/department', authenticate, authorize('SuperAdmin', 'Admin'), async (req, res) => {
    try {
        const { department } = req.body;
        await dbRun('UPDATE printers SET department = ?, updated_at = GETDATE() WHERE id = ?', [department, req.params.id]);
        res.json({ success: true });
    } catch (err) {
        console.error('Failed to update printer department:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Delete a printer
router.delete('/:id', authenticate, authorize('SuperAdmin', 'Admin'), async (req, res) => {
    try {
        const existing = await dbGet('SELECT id FROM printers WHERE id = ?', [req.params.id]);
        if (!existing) {
            return res.status(404).json({ error: 'Printer not found' });
        }

        await dbRun('DELETE FROM printers WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        console.error('Failed to delete printer:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Ping endpoint for live status
router.get('/:id/status', authenticate, authorize('SuperAdmin', 'Admin', 'Viewer'), async (req, res) => {
    try {
        const printer = await dbGet('SELECT ip_address FROM printers WHERE id = ?', [req.params.id]);
        if (!printer || !printer.ip_address) {
            return res.status(404).json({ error: 'Printer not found or missing IP' });
        }

        const ip = printer.ip_address;

        // Use native ping command. -n 1 sends 1 packet, -w 1000 sets timeout to 1 second
        // For Windows: ping -n 1 -w 1000 <ip>
        // For Linux/Mac fallback: ping -c 1 -W 1 <ip> (we'll try Windows format first since this is a Windows-centric app)
        try {
            const isWin = process.platform === 'win32';
            const cmd = isWin ? `ping -n 1 -w 1000 ${ip}` : `ping -c 1 -W 1 ${ip}`;
            await execAsync(cmd);
            // If the command succeeds, the device is online
            return res.json({ online: true });
        } catch (pingErr) {
            // Exec throws an error when exit code is not 0 (e.g., Request timed out)
            return res.json({ online: false });
        }
    } catch (err) {
        console.error('Ping failed:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;

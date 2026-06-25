import { Router, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { dbGet, dbAll, dbRun } from '../database/index.js';
import { createError } from '../middleware/errorHandler.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { logAudit } from '../middleware/audit.js';
import { config } from '../config.js';

const router = Router();
const backupsDir = path.join(process.cwd(), config.backupsDir);
if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true });

router.get('/', authenticate, authorize('SuperAdmin', 'Admin'), async (req: AuthRequest, res: Response, next: NextFunction) => {
    try { const backups = await dbAll('SELECT TOP 20 * FROM backups ORDER BY created_at DESC', []); res.json({ backups }); } catch (error) { next(error); }
});

router.post('/', authenticate, authorize('SuperAdmin', 'Admin'), async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `backup-${timestamp}.json`;
        const backupPath = path.join(backupsDir, filename);

        // Export all key tables as JSON (done by Node.js, no SQL Server service account perms needed)
        const tables = [
            'machines', 'machine_metadata', 'network_interfaces', 'installed_apps',
            'app_events', 'compliance_rules', 'compliance_results', 'rule_exceptions',
            'incidents', 'alerts', 'tasks', 'task_subtasks', 'task_assignments',
            'printers', 'news_items', 'switch_inventory', 'scan_results',
            'audit_logs', 'settings', 'users', 'machine_vulnerabilities'
        ];

        const exportData: Record<string, any[]> = {
            _meta: {
                exported_at: new Date().toISOString(),
                exported_by: req.user?.username || 'unknown',
                version: '1.0',
                db_name: config.dbName
            } as any
        };

        for (const table of tables) {
            try {
                exportData[table] = await dbAll(`SELECT * FROM ${table}`, []);
            } catch {
                exportData[table] = []; // Skip tables that may not exist yet
            }
        }

        fs.writeFileSync(backupPath, JSON.stringify(exportData, null, 2), 'utf8');

        const stats = fs.statSync(backupPath);
        const id = uuidv4();

        await dbRun("INSERT INTO backups (id, filename, file_path, file_size, backup_type, created_by) VALUES (?, ?, ?, ?, 'manual', ?)",
            [id, filename, backupPath, stats.size, req.user?.id || null]);

        await logAudit(req.user?.id || null, req.user?.username || '', `Created system backup: ${filename}`, 'backup', id, null, { filename }, req.ip || '', req.headers['user-agent'] as string || '');
        res.status(201).json({ id, filename, size: stats.size, message: 'Backup created successfully' });
    } catch (error) { next(error); }
});


router.get('/:id/download', authenticate, authorize('SuperAdmin', 'Admin'), async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const backup = await dbGet('SELECT * FROM backups WHERE id = ?', [req.params.id]) as any;
        if (!backup || !fs.existsSync(backup.file_path)) throw createError('Backup not found', 404);
        await logAudit(req.user?.id || null, req.user?.username || '', `Downloaded backup: ${backup.filename}`, 'backup', req.params.id, null, null, req.ip || '', req.headers['user-agent'] as string || '');
        res.download(backup.file_path, backup.filename);
    } catch (error) { next(error); }
});

router.delete('/:id', authenticate, authorize('SuperAdmin'), async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const backup = await dbGet('SELECT * FROM backups WHERE id = ?', [req.params.id]) as any;
        if (!backup) throw createError('Backup not found', 404);

        // Try to delete file, but don't crash if it fails (e.g. file already gone)
        try {
            if (fs.existsSync(backup.file_path)) {
                fs.unlinkSync(backup.file_path);
            }
        } catch (fileErr) {
            console.error(`Failed to delete backup file: ${backup.file_path}`, fileErr);
            // Continue to delete from DB even if file delete fails
        }

        await dbRun('DELETE FROM backups WHERE id = ?', [req.params.id]);
        await logAudit(req.user?.id || null, req.user?.username || '', `Deleted backup: ${backup.filename}`, 'backup', req.params.id, null, null, req.ip || '', req.headers['user-agent'] as string || '');
        res.json({ message: 'Deleted' });
    } catch (error) { next(error); }
});

export default router;

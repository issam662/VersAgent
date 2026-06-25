import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { dbAll, dbRun } from '../database/index.js';
import { config } from '../config.js';

const backupsDir = path.join(process.cwd(), config.backupsDir);
const MAX_AUTO_BACKUPS = 7; // Keep last 7 automatic backups

// Tables to export
const TABLES = [
    'machines', 'machine_metadata', 'network_interfaces', 'installed_apps',
    'app_events', 'compliance_rules', 'compliance_results', 'rule_exceptions',
    'incidents', 'alerts', 'tasks', 'task_subtasks', 'task_assignments',
    'printers', 'news_items', 'switch_inventory', 'scan_results',
    'audit_logs', 'settings', 'users', 'machine_vulnerabilities'
];

export async function runAutoBackup(): Promise<void> {
    console.log('[AUTO-BACKUP] Starting scheduled automatic backup...');

    if (!fs.existsSync(backupsDir)) {
        fs.mkdirSync(backupsDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `auto-backup-${timestamp}.json`;
    const backupPath = path.join(backupsDir, filename);

    try {
        const exportData: Record<string, any> = {
            _meta: {
                exported_at: new Date().toISOString(),
                exported_by: 'auto-backup',
                version: '1.0',
                db_name: config.dbName
            }
        };

        for (const table of TABLES) {
            try {
                exportData[table] = await dbAll(`SELECT * FROM ${table}`, []);
            } catch {
                exportData[table] = [];
            }
        }

        fs.writeFileSync(backupPath, JSON.stringify(exportData, null, 2), 'utf8');
        const stats = fs.statSync(backupPath);
        const id = uuidv4();

        await dbRun(
            "INSERT INTO backups (id, filename, file_path, file_size, backup_type, created_by) VALUES (?, ?, ?, ?, 'automatic', NULL)",
            [id, filename, backupPath, stats.size]
        );

        console.log(`[AUTO-BACKUP] Backup completed: ${filename} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);

        // Cleanup: remove old automatic backups, keep only the last MAX_AUTO_BACKUPS
        await pruneOldAutoBackups();

    } catch (err: any) {
        console.error('[AUTO-BACKUP] Backup failed:', err.message);
    }
}

async function pruneOldAutoBackups(): Promise<void> {
    try {
        const old = await dbAll(
            `SELECT id, file_path FROM backups WHERE backup_type = 'automatic' ORDER BY created_at DESC OFFSET ? ROWS`,
            [MAX_AUTO_BACKUPS]
        );
        for (const b of old as any[]) {
            try {
                if (b.file_path && fs.existsSync(b.file_path)) fs.unlinkSync(b.file_path);
            } catch { /* ignore file delete errors */ }
            await dbRun('DELETE FROM backups WHERE id = ?', [b.id]);
        }
        if (old.length > 0) {
            console.log(`[AUTO-BACKUP] Pruned ${old.length} old automatic backup(s).`);
        }
    } catch (err: any) {
        console.error('[AUTO-BACKUP] Pruning failed:', err.message);
    }
}

let autoBackupTimer: NodeJS.Timeout | null = null;

export function startAutoBackupService(): void {
    if (autoBackupTimer) return;

    const scheduleNext = () => {
        const now = new Date();
        const next = new Date();
        next.setHours(19, 0, 0, 0); // 19:00 local time

        // If 19:00 has already passed today, schedule for tomorrow
        if (now >= next) next.setDate(next.getDate() + 1);

        const msUntilNext = next.getTime() - now.getTime();
        const hoursUntil = (msUntilNext / 1000 / 60 / 60).toFixed(1);
        console.log(`✓ Auto-backup scheduled at 19:00 daily (next run in ${hoursUntil}h)`);

        autoBackupTimer = setTimeout(async () => {
            await runAutoBackup();
            autoBackupTimer = null;
            scheduleNext(); // Reschedule for next day
        }, msUntilNext);
    };

    scheduleNext();
}

export function stopAutoBackupService(): void {
    if (autoBackupTimer) {
        clearTimeout(autoBackupTimer);
        autoBackupTimer = null;
        console.log('[AUTO-BACKUP] Service stopped.');
    }
}

import { Router, Response, NextFunction } from 'express';
import { dbGet, dbRun, dbAll } from '../database/index.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { logAudit } from '../middleware/audit.js';

const router = Router();

// Get all settings or a specific setting
router.get('/', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const key = req.query.key as string;
        if (key) {
            const setting = await dbGet('SELECT * FROM settings WHERE [key] = ?', [key]);
            return res.json({ setting });
        }
        const settings = await dbAll('SELECT * FROM settings', []);
        res.json({ settings });
    } catch (error) {
        next(error);
    }
});

// Update a setting
router.put('/:key', authenticate, authorize('SuperAdmin', 'Admin'), async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const { key } = req.params;
        const { value } = req.body;

        if (value === undefined) {
            return res.status(400).json({ error: 'Value is required' });
        }

        const oldSetting = await dbGet('SELECT * FROM settings WHERE [key] = ?', [key]);

        await dbRun(`
            MERGE settings AS target
            USING (SELECT ? AS [key], ? AS [value]) AS source
            ON (target.[key] = source.[key])
            WHEN MATCHED THEN
                UPDATE SET [value] = source.[value], updated_at = GETUTCDATE()
            WHEN NOT MATCHED THEN
                INSERT ([key], [value], updated_at) VALUES (source.[key], source.[value], GETUTCDATE());
        `, [key, value.toString()]);

        await logAudit(
            req.user?.id || null,
            req.user?.username || '',
            `Updated setting: ${key}`,
            'setting',
            key,
            oldSetting || null,
            { value },
            req.ip || '',
            req.headers['user-agent'] as string || ''
        );

        res.json({ message: 'Setting updated' });
    } catch (error) {
        next(error);
    }
});

export default router;

import express from 'express';
import { dbAll, dbRun } from '../database/index.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';

const router = express.Router();

// Get recent alerts
router.get('/', authenticate, async (req: AuthRequest, res, next) => {
    try {
        const limit = parseInt(req.query.limit as string) || 20;
        const offset = parseInt(req.query.offset as string) || 0;
        const userId = req.user?.id;
        
        const alerts = await dbAll(`
            SELECT * FROM alerts 
            WHERE user_id = ? OR user_id IS NULL
            ORDER BY created_at DESC 
            OFFSET ? ROWS
            FETCH NEXT ? ROWS ONLY
        `, [userId, offset, limit]);

        res.json({ alerts });
    } catch (error) {
        next(error);
    }
});

// Get unread count
router.get('/unread-count', authenticate, async (req: AuthRequest, res, next) => {
    try {
        const userId = req.user?.id;
        const result = await dbAll(`
            SELECT COUNT(*) as count FROM alerts 
            WHERE is_read = 0 AND (user_id = ? OR user_id IS NULL)
        `, [userId]);
        res.json({ count: result[0].count });
    } catch (error) {
        next(error);
    }
});

// Mark single alert as read
router.put('/:id/read', authenticate, async (req: AuthRequest, res, next) => {
    try {
        const { id } = req.params;
        await dbRun(`
            UPDATE alerts SET is_read = 1 WHERE id = ?
        `, [id]);
        res.json({ message: 'Alert marked as read' });
    } catch (error) {
        next(error);
    }
});

// Mark all alerts as read
router.put('/read-all', authenticate, async (req: AuthRequest, res, next) => {
    try {
        const userId = req.user?.id;
        await dbRun(`
            UPDATE alerts SET is_read = 1 
            WHERE is_read = 0 AND (user_id = ? OR user_id IS NULL)
        `, [userId]);
        res.json({ message: 'All alerts marked as read' });
    } catch (error) {
        next(error);
    }
});

export default router;

import { Router, Response, NextFunction } from 'express';
import { dbAll, dbGet } from '../database/index.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';

const router = Router();

router.get('/', authenticate, authorize('SuperAdmin', 'Admin'), async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const { userId, action, entityType, username, startDate, endDate, page = '1', limit = '100' } = req.query;

        let query = `
            SELECT 
                al.*, 
                u.username, 
                u.full_name,
                al.timestamp as created_at
            FROM audit_logs al 
            LEFT JOIN users u ON al.user_id = u.id 
            WHERE 1=1
        `;
        const params: any[] = [];

        if (userId) {
            query += ' AND al.user_id = ?';
            params.push(userId);
        }
        if (action) {
            query += ' AND al.action = ?';
            params.push(action);
        }
        if (entityType) {
            query += ' AND al.entity_type = ?';
            params.push(entityType);
        }
        if (username) {
            query += ' AND u.username LIKE ?';
            params.push(`%${username}%`);
        }
        if (startDate) {
            query += ' AND CAST(al.timestamp AS DATE) >= CAST(? AS DATE)';
            params.push(startDate);
        }
        if (endDate) {
            query += ' AND CAST(al.timestamp AS DATE) <= CAST(? AS DATE)';
            params.push(endDate);
        }

        // Get total count for pagination
        const countQuery = query.replace(/SELECT[\s\S]*?FROM/, 'SELECT COUNT(*) as total FROM');
        const countResult = await dbGet(countQuery, params) as any;
        const total = countResult?.total || 0;

        const pageNum = parseInt(page as string);
        const limitNum = parseInt(limit as string);
        const totalPages = Math.ceil(total / limitNum);

        query += ` ORDER BY al.timestamp DESC OFFSET ${(pageNum - 1) * limitNum} ROWS FETCH NEXT ${limitNum} ROWS ONLY`;

        const logs = await dbAll(query, params);

        res.json({
            logs,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                totalPages
            }
        });
    } catch (error) {
        next(error);
    }
});

router.get('/actions', authenticate, authorize('SuperAdmin', 'Admin'), async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const a = await dbAll('SELECT DISTINCT action FROM audit_logs ORDER BY action', []);
        res.json({ actions: a.map((x: any) => x.action) });
    } catch (error) {
        next(error);
    }
});

router.get('/entity-types', authenticate, authorize('SuperAdmin', 'Admin'), async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const t = await dbAll('SELECT DISTINCT entity_type FROM audit_logs WHERE entity_type IS NOT NULL ORDER BY entity_type', []);
        res.json({ entityTypes: t.map((x: any) => x.entity_type) });
    } catch (error) {
        next(error);
    }
});

export default router;

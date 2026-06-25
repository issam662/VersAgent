import { Router, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { dbGet, dbAll, dbRun } from '../database/index.js';
import { createError } from '../middleware/errorHandler.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { logAudit } from '../middleware/audit.js';

const router = Router();

router.get('/', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const { status, priority, assignedTo, page = '1', limit = '50' } = req.query;
        let query = `SELECT i.*, m.hostname as machine_hostname, u.full_name as assigned_to_name FROM incidents i LEFT JOIN machines m ON i.machine_id = m.id LEFT JOIN users u ON i.assigned_to = u.id WHERE 1=1`;
        const params: any[] = [];
        if (status) { query += ' AND i.status = ?'; params.push(status); }
        if (priority) { query += ' AND i.priority = ?'; params.push(priority); }
        if (assignedTo) { query += ' AND i.assigned_to = ?'; params.push(assignedTo); }
        query += ` ORDER BY i.created_at DESC OFFSET ${(parseInt(page as string) - 1) * parseInt(limit as string)} ROWS FETCH NEXT ${parseInt(limit as string)} ROWS ONLY`;
        const incidents = await dbAll(query, params);

        // Get total count for pagination
        let countSql = `SELECT COUNT(*) as total FROM incidents i WHERE 1=1`;
        const countParams: any[] = [];
        if (status) { countSql += ' AND i.status = ?'; countParams.push(status); }
        if (priority) { countSql += ' AND i.priority = ?'; countParams.push(priority); }
        if (assignedTo) { countSql += ' AND i.assigned_to = ?'; countParams.push(assignedTo); }

        const totalResult = await dbGet(countSql, countParams) as any;
        const total = totalResult?.total || 0;

        const counts = await dbGet(`SELECT COUNT(CASE WHEN status = 'Open' THEN 1 END) as [open], COUNT(CASE WHEN status = 'In Progress' THEN 1 END) as in_progress FROM incidents`, []) as any;

        res.json({
            incidents,
            total,
            counts: { open: counts?.open || 0, inProgress: counts?.in_progress || 0 }
        });
    } catch (error) { next(error); }
});

router.get('/:id', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const incident = await dbGet('SELECT i.*, m.hostname as machine_hostname FROM incidents i LEFT JOIN machines m ON i.machine_id = m.id WHERE i.id = ?', [req.params.id]);
        if (!incident) throw createError('Incident not found', 404);
        res.json({ incident });
    } catch (error) { next(error); }
});

router.post('/', authenticate, authorize('SuperAdmin', 'Admin'), async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const { title, description, status, priority, machineId, assignedTo, incidentDate } = req.body;
        if (!title) throw createError('Title is required', 400);
        const id = uuidv4();
        if (incidentDate) {
            await dbRun('INSERT INTO incidents (id, title, description, status, priority, machine_id, assigned_to, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [id, title, description || null, status || 'Open', priority || 'Medium', machineId || null, assignedTo || null, req.user?.id, new Date(incidentDate)]);
        } else {
            await dbRun('INSERT INTO incidents (id, title, description, status, priority, machine_id, assigned_to, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [id, title, description || null, status || 'Open', priority || 'Medium', machineId || null, assignedTo || null, req.user?.id]);
        }
        await logAudit(req.user?.id || null, req.user?.username || '', `Created incident report: ${title}`, 'incident', id, null, { title }, req.ip || '', req.headers['user-agent'] as string || '');
        res.status(201).json({ id, message: 'Incident created' });
    } catch (error) { next(error); }
});

router.put('/:id', authenticate, authorize('SuperAdmin', 'Admin'), async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const { title, description, status, priority, machineId, assignedTo } = req.body;
        await dbRun('UPDATE incidents SET title = COALESCE(?, title), description = COALESCE(?, description), status = COALESCE(?, status), priority = COALESCE(?, priority), machine_id = ?, assigned_to = ?, updated_at = GETUTCDATE() WHERE id = ?', [title, description, status, priority, machineId, assignedTo, req.params.id]);
        const incident = await dbGet('SELECT title FROM incidents WHERE id = ?', [req.params.id]) as any;
        await logAudit(req.user?.id || null, req.user?.username || '', `Updated incident report: ${incident?.title || req.params.id}`, 'incident', req.params.id, null, req.body, req.ip || '', req.headers['user-agent'] as string || '');
        res.json({ message: 'Incident updated' });
    } catch (error) { next(error); }
});

router.delete('/:id', authenticate, authorize('SuperAdmin', 'Admin'), async (req: AuthRequest, res: Response, next: NextFunction) => {
    try { const inc = await dbGet('SELECT title FROM incidents WHERE id = ?', [req.params.id]) as any; await dbRun('DELETE FROM incidents WHERE id = ?', [req.params.id]); await logAudit(req.user?.id || null, req.user?.username || '', `Deleted incident report: ${inc?.title || 'Unknown'}`, 'incident', req.params.id, null, null, req.ip || '', req.headers['user-agent'] as string || ''); res.json({ message: 'Deleted' }); } catch (error) { next(error); }
});

export default router;

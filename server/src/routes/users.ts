import { Router, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import { dbGet, dbAll, dbRun } from '../database/index.js';
import { createError } from '../middleware/errorHandler.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { logAudit } from '../middleware/audit.js';

const router = Router();

// Get all users (SuperAdmin and Admin)
router.get('/', authenticate, authorize('SuperAdmin', 'Admin'), async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const users = await dbAll(
            'SELECT id, username, email, email_notifications, full_name, title, role, is_active, last_login, avatar, created_at FROM users ORDER BY created_at DESC',
            []
        );
        res.json({ users });
    } catch (error) {
        next(error);
    }
});

// Get single user
router.get('/:id', authenticate, authorize('SuperAdmin'), async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const user = await dbGet(
            'SELECT id, username, email, email_notifications, full_name, title, role, is_active, last_login, avatar, created_at FROM users WHERE id = ?',
            [req.params.id]
        );
        if (!user) throw createError('User not found', 404);
        res.json({ user });
    } catch (error) {
        next(error);
    }
});

// Create new user
router.post('/', authenticate, authorize('SuperAdmin'), async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const { username, password, email, emailNotifications, role, fullName, title } = req.body;
        if (!username || !password) throw createError('Username and password required', 400);
        if (!['Admin', 'Viewer'].includes(role)) throw createError('Role must be Admin or Viewer', 400);
        if (await dbGet('SELECT id FROM users WHERE username = ?', [username])) throw createError('Username exists', 409);

        const id = uuidv4();
        await dbRun(
            'INSERT INTO users (id, username, password_hash, email, email_notifications, full_name, title, role) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [id, username, await bcrypt.hash(password, 12), email || null, emailNotifications ? 1 : 0, fullName || null, title || null, role]
        );
        await logAudit(req.user?.id || null, req.user?.username || '', `Created new user account: ${username} (${role})`, 'user', id, null, { username, role }, req.ip || '', req.headers['user-agent'] as string || '');
        res.status(201).json({ id, message: 'User created' });
    } catch (error) {
        next(error);
    }
});

// Update user
router.put('/:id', authenticate, authorize('SuperAdmin'), async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const { email, emailNotifications, role, isActive, fullName, title } = req.body;
        const old = await dbGet('SELECT * FROM users WHERE id = ?', [req.params.id]) as any;
        if (!old) throw createError('User not found', 404);
        if (old.role === 'SuperAdmin' && role && role !== 'SuperAdmin') throw createError('Cannot change SuperAdmin role', 403);

        await dbRun(
            `UPDATE users SET 
                email = COALESCE(?, email), 
                email_notifications = COALESCE(?, email_notifications),
                role = COALESCE(?, role), 
                is_active = COALESCE(?, is_active),
                full_name = COALESCE(?, full_name),
                title = COALESCE(?, title),
                updated_at = GETUTCDATE() 
            WHERE id = ?`,
            [
                email,
                emailNotifications !== undefined ? (emailNotifications ? 1 : 0) : null,
                role,
                isActive !== undefined ? (isActive ? 1 : 0) : null,
                fullName,
                title,
                req.params.id
            ]
        );
        await logAudit(req.user?.id || null, req.user?.username || '', `Updated user account: ${old.username}`, 'user', req.params.id, null, req.body, req.ip || '', req.headers['user-agent'] as string || '');
        res.json({ message: 'Updated' });
    } catch (error) {
        next(error);
    }
});

// Reset password
router.post('/:id/reset-password', authenticate, authorize('SuperAdmin'), async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const { newPassword } = req.body;
        if (!newPassword || newPassword.length < 8) throw createError('Password must be at least 8 characters', 400);
        await dbRun('UPDATE users SET password_hash = ?, updated_at = GETUTCDATE() WHERE id = ?', [await bcrypt.hash(newPassword, 12), req.params.id]);
        await dbRun('DELETE FROM sessions WHERE user_id = ?', [req.params.id]);
        const targetUser = await dbGet('SELECT username FROM users WHERE id = ?', [req.params.id]) as any;
        await logAudit(req.user?.id || null, req.user?.username || '', `Reset password for user: ${targetUser?.username || 'Unknown'}`, 'user', req.params.id, null, {}, req.ip || '', req.headers['user-agent'] as string || '');
        res.json({ message: 'Password reset' });
    } catch (error) {
        next(error);
    }
});

// Delete user
router.delete('/:id', authenticate, authorize('SuperAdmin'), async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const user = await dbGet('SELECT * FROM users WHERE id = ?', [req.params.id]) as any;
        if (!user) throw createError('User not found', 404);
        if (user.role === 'SuperAdmin') throw createError('Cannot delete SuperAdmin', 403);
        if (user.id === req.user?.id) throw createError('Cannot delete yourself', 403);

        // Nullify references in other tables to avoid foreign key constraint violations
        await dbRun('UPDATE news_items SET created_by = NULL WHERE created_by = ?', [req.params.id]);
        await dbRun('UPDATE incidents SET created_by = NULL WHERE created_by = ?', [req.params.id]);
        await dbRun('UPDATE incidents SET assigned_to = NULL WHERE assigned_to = ?', [req.params.id]);
        await dbRun('UPDATE backups SET created_by = NULL WHERE created_by = ?', [req.params.id]);
        await dbRun('UPDATE rule_exceptions SET created_by = NULL WHERE created_by = ?', [req.params.id]);
        await dbRun('UPDATE audit_logs SET user_id = NULL WHERE user_id = ?', [req.params.id]);

        await dbRun('DELETE FROM users WHERE id = ?', [req.params.id]);
        await logAudit(req.user?.id || null, req.user?.username || '', `Deleted user account: ${user.username}`, 'user', req.params.id, null, { username: user.username }, req.ip || '', req.headers['user-agent'] as string || '');
        res.json({ message: 'Deleted' });
    } catch (error) {
        next(error);
    }
});

export default router;

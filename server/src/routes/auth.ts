import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { dbGet, dbRun } from '../database/index.js';
import { config } from '../config.js';
import { createError } from '../middleware/errorHandler.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { logAudit } from '../middleware/audit.js';

const router = Router();

// Login
router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            throw createError('Username and password required', 400);
        }

        const user = await dbGet('SELECT * FROM users WHERE username = ?', [username]) as any;

        if (!user) {
            await logAudit(null, username, `Failed login attempt for non-existent user: ${username}`, 'user', '', null, { reason: 'user_not_found' }, req.ip || '', req.headers['user-agent'] as string || '');
            throw createError('Invalid credentials', 401);
        }

        if (user.locked_until && new Date(user.locked_until) > new Date()) {
            await logAudit(user.id, username, `Failed login attempt - account locked: ${username}`, 'user', user.id, null, { reason: 'account_locked' }, req.ip || '', req.headers['user-agent'] as string || '');
            throw createError('Account is temporarily locked. Try again later.', 423);
        }

        if (!user.is_active) {
            throw createError('Account is disabled', 403);
        }

        const isValid = await bcrypt.compare(password, user.password_hash);

        if (!isValid) {
            let newAttempts = (user.failed_login_attempts || 0) + 1;
            let lockedUntil = null;

            if (newAttempts >= config.bruteForceMaxAttempts) {
                lockedUntil = new Date(Date.now() + config.bruteForceWindowMinutes * 60 * 1000).toISOString();
                newAttempts = 0;
            }

            await dbRun('UPDATE users SET failed_login_attempts = ?, locked_until = ? WHERE id = ?', [newAttempts, lockedUntil, user.id]);
            await logAudit(user.id, username, `Failed login attempt - invalid password: ${username}`, 'user', user.id, null, { reason: 'invalid_password' }, req.ip || '', req.headers['user-agent'] as string || '');

            throw createError('Invalid credentials', 401);
        }

        await dbRun('UPDATE users SET failed_login_attempts = 0, locked_until = NULL, last_login = GETUTCDATE() WHERE id = ?', [user.id]);

        const token = jwt.sign(
            { userId: user.id, username: user.username, role: user.role },
            config.jwtSecret as string,
            { expiresIn: config.jwtExpiresIn as any }
        );

        const sessionId = uuidv4();
        const expiresAt = new Date(Date.now() + config.sessionTimeoutMinutes * 60 * 1000).toISOString();

        await dbRun(`
      INSERT INTO sessions (id, user_id, token, expires_at, ip_address, user_agent)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [sessionId, user.id, token, expiresAt, req.ip, req.headers['user-agent']]);

        await logAudit(user.id, username, `Successful login: ${username}`, 'user', user.id, null, null, req.ip || '', req.headers['user-agent'] as string || '');

        res.json({
            token,
            user: {
                id: user.id,
                username: user.username,
                role: user.role,
                email: user.email,
                emailNotifications: !!user.email_notifications,
                email_notifications: !!user.email_notifications,
                fullName: user.full_name,
                full_name: user.full_name,
                title: user.title,
                avatar: user.avatar
            },
            expiresAt,
        });
    } catch (error) {
        next(error);
    }
});

// Logout
router.post('/logout', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (token) {
            await dbRun('DELETE FROM sessions WHERE token = ?', [token]);
            await logAudit(req.user?.id || null, req.user?.username || '', `User logged out: ${req.user?.username || 'Unknown'}`, 'session', '', null, null, req.ip || '', req.headers['user-agent'] as string || '');
        }
        res.json({ success: true });
    } catch (error) {
        next(error);
    }
});

// Get current session
router.get('/session', authenticate, (req: AuthRequest, res: Response) => {
    res.json({ user: req.user });
});

// Refresh session
router.post('/refresh', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        const expiresAt = new Date(Date.now() + config.sessionTimeoutMinutes * 60 * 1000).toISOString();
        if (token) {
            await dbRun('UPDATE sessions SET expires_at = ? WHERE token = ?', [expiresAt, token]);
        }
        res.json({ expiresAt });
    } catch (error) {
        next(error);
    }
});

// Change password (for own account)
router.post('/change-password', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            throw createError('Current and new password required', 400);
        }

        if (newPassword.length < 8) {
            throw createError('New password must be at least 8 characters', 400);
        }

        const user = await dbGet('SELECT * FROM users WHERE id = ?', [req.user?.id]) as any;
        if (!user) {
            throw createError('User not found', 404);
        }

        const isValid = await bcrypt.compare(currentPassword, user.password_hash);
        if (!isValid) {
            throw createError('Current password is incorrect', 401);
        }

        await dbRun(
            'UPDATE users SET password_hash = ?, updated_at = GETUTCDATE() WHERE id = ?',
            [await bcrypt.hash(newPassword, 12), req.user?.id]
        );

        await logAudit(
            req.user?.id || null,
            req.user?.username || '',
            'change_password',
            'user',
            req.user?.id || '',
            null,
            null,
            req.ip || '',
            req.headers['user-agent'] as string || ''
        );

        res.json({ message: 'Password changed successfully' });
    } catch (error) {
        next(error);
    }
});

// Update profile (own account)
router.patch('/profile', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const { fullName, title, avatar, email, emailNotifications } = req.body;

        // Build update query dynamically
        const updates: string[] = [];
        const params: any[] = [];

        if (fullName !== undefined) {
            updates.push('full_name = ?');
            params.push(fullName);
        }
        if (title !== undefined) {
            updates.push('title = ?');
            params.push(title);
        }
        if (avatar !== undefined) {
            updates.push('avatar = ?');
            params.push(avatar);
        }
        if (email !== undefined) {
            updates.push('email = ?');
            params.push(email);
        }
        if (emailNotifications !== undefined) {
            updates.push('email_notifications = ?');
            params.push(emailNotifications ? 1 : 0);
        }

        if (updates.length === 0) {
            throw createError('No update data provided', 400);
        }

        params.push(req.user?.id);

        await dbRun(
            `UPDATE users SET ${updates.join(', ')}, updated_at = GETUTCDATE() WHERE id = ?`,
            params
        );

        // Fetch updated user
        const updatedUser = await dbGet('SELECT id, username, role, email, email_notifications, full_name, title, avatar FROM users WHERE id = ?', [req.user?.id]) as any;

        await logAudit(
            req.user?.id || null,
            req.user?.username || '',
            `Updated profile: ${req.user?.username}`,
            'user',
            req.user?.id || '',
            null,
            req.body,
            req.ip || '',
            req.headers['user-agent'] as string || ''
        );

        res.json({
            message: 'Profile updated successfully',
            user: {
                id: updatedUser.id,
                username: updatedUser.username,
                role: updatedUser.role,
                email: updatedUser.email,
                emailNotifications: !!updatedUser.email_notifications,
                email_notifications: !!updatedUser.email_notifications,
                fullName: updatedUser.full_name,
                full_name: updatedUser.full_name,
                title: updatedUser.title,
                avatar: updatedUser.avatar
            }
        });
    } catch (error) {
        next(error);
    }
});

export default router;


import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { dbGet } from '../database/index.js';
import { createError } from './errorHandler.js';

export interface AuthRequest extends Request {
    user?: {
        id: string;
        username: string;
        role: 'SuperAdmin' | 'Admin' | 'Viewer';
    };
}

export async function authenticate(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            throw createError('Authentication required', 401);
        }

        const token = authHeader.split(' ')[1];

        // Verify JWT
        const decoded = jwt.verify(token, config.jwtSecret) as {
            userId: string;
            username: string;
            role: string;
        };

        // Check session exists and is valid
        const session = await dbGet(`
      SELECT s.*, u.role, u.is_active, u.username, u.last_login
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.token = ? AND s.expires_at > GETUTCDATE()
    `, [token]) as any;

        if (!session) {
            throw createError('Session expired or invalid', 401);
        }

        if (!session.is_active) {
            throw createError('Account is disabled', 403);
        }

        req.user = {
            id: decoded.userId,
            username: session.username,
            role: session.role,
        };

        // Update last_login (acting as last_active) if it's been more than 5 minutes since last update
        // We do this asynchronously to not block the request
        const lastLoginDate = session.last_login ? new Date(session.last_login) : new Date(0);
        const now = new Date();
        if (now.getTime() - lastLoginDate.getTime() > 5 * 60 * 1000) {
            import('../database/index.js').then(({ dbRun }) => {
                dbRun('UPDATE users SET last_login = GETUTCDATE() WHERE id = ?', [decoded.userId])
                    .catch(e => console.error('Failed to update last active status:', e));
            }).catch(console.error);
        }

        next();
    } catch (error: any) {
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
            next(createError('Invalid or expired token', 401));
        } else {
            next(error);
        }
    }
}

export function authorize(...allowedRoles: string[]) {
    return (req: AuthRequest, res: Response, next: NextFunction): void => {
        if (!req.user) {
            return next(createError('Authentication required', 401));
        }

        if (!allowedRoles.includes(req.user.role)) {
            return next(createError('Insufficient permissions', 403));
        }

        next();
    };
}

// For agent authentication via API key
export function authenticateAgent(req: Request, res: Response, next: NextFunction): void {
    const apiKey = req.headers['x-api-key'];

    if (!apiKey) {
        return next(createError('API key required', 401));
    }

    // In production, validate against stored API keys
    // For now, accept any non-empty key (should be configured per-agent)
    if (typeof apiKey !== 'string' || apiKey.length < 32) {
        return next(createError('Invalid API key', 401));
    }

    next();
}

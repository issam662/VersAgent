import { Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { dbRun } from '../database/index.js';
import { AuthRequest } from './auth.js';

interface AuditData {
    action: string;
    entityType?: string;
    entityId?: string;
    oldValue?: any;
    newValue?: any;
}

export function audit(data: AuditData) {
    return (req: AuthRequest, res: Response, next: NextFunction): void => {
        // Store original json method
        const originalJson = res.json.bind(res);

        // Override json to capture successful responses
        res.json = function (body: any) {
            // Only audit on successful responses
            if (res.statusCode >= 200 && res.statusCode < 300) {
                dbRun(`
          INSERT INTO audit_logs (id, user_id, username, action, entity_type, entity_id, old_value, new_value, ip_address, user_agent)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
                    uuidv4(),
                    req.user?.id || null,
                    req.user?.username || 'anonymous',
                    data.action,
                    data.entityType || null,
                    data.entityId || body?.id || null,
                    data.oldValue ? JSON.stringify(data.oldValue) : null,
                    data.newValue ? JSON.stringify(data.newValue) : null,
                    req.ip || req.socket?.remoteAddress || '',
                    req.headers['user-agent'] || null
                ]).catch(err => console.error('Failed to write audit log:', err));
            }

            return originalJson(body);
        };

        next();
    };
}

export async function logAudit(
    userId: string | null,
    username: string,
    action: string,
    entityType: string,
    entityId: string,
    oldValue: any = null,
    newValue: any = null,
    ipAddress: string = '',
    userAgent: string = ''
): Promise<void> {
    try {
        await dbRun(`
      INSERT INTO audit_logs (id, user_id, username, action, entity_type, entity_id, old_value, new_value, ip_address, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
            uuidv4(),
            userId,
            username,
            action,
            entityType,
            entityId,
            oldValue ? JSON.stringify(oldValue) : null,
            newValue ? JSON.stringify(newValue) : null,
            ipAddress,
            userAgent
        ]);
    } catch (error) {
        console.error('Failed to write audit log:', error);
    }
}

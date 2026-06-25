import { v4 as uuidv4 } from 'uuid';
import { dbRun, dbAll } from '../database/index.js';
import { sendEmail } from './emailService.js';

export interface NotificationPayload {
    userId?: string;
    machineId?: string;
    type: string;
    severity: 'info' | 'warning' | 'error' | 'critical';
    title: string;
    message: string;
    link?: string;
}

class NotificationService {
    private interval: NodeJS.Timeout | null = null;

    /**
     * Send an immediate notification to a user or system-wide
     */
    async sendNotification(payload: NotificationPayload) {
        try {
            const id = uuidv4();
            // In our schema, alerts are stored in the 'alerts' table.
            // Note: The 'alerts' table currently has (id, machine_id, alert_type, severity, title, message, is_read, created_at)
            // We might want to add a user_id column to the alerts table for targeted notifications.
            // For now, we'll use the existing schema and maybe add user_id if needed.
            
            await dbRun(`
                INSERT INTO alerts (id, machine_id, user_id, alert_type, severity, title, message, link, is_read)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
            `, [
                id, 
                payload.machineId || null, 
                payload.userId || null,
                payload.type, 
                payload.severity, 
                payload.title, 
                payload.message,
                payload.link || null
            ]);

            console.log(`[Notification] ${payload.title}: ${payload.message}`);

            // Send Email if applicable
            if (payload.userId) {
                try {
                    const user = await dbAll('SELECT email, full_name, email_notifications FROM users WHERE id = ?', [payload.userId]);
                    if (user && user.length > 0 && user[0].email && user[0].email_notifications) {
                        const dashboardUrl = process.env.PUBLIC_URL || 'http://localhost:5173';
                        const linkStr = payload.link ? `<p><a href="${dashboardUrl}${payload.link}" style="display:inline-block;padding:10px 20px;background-color:#F5B041;color:#121926;text-decoration:none;border-radius:6px;font-weight:bold;">View Details</a></p>` : '';
                        
                        const html = `
                            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #1a2233; color: #fff; padding: 20px; border-radius: 8px;">
                                <h2 style="color: #F5B041;">${payload.title}</h2>
                                <p style="font-size: 16px; color: #d1d5db;">Hello ${user[0].full_name || 'User'},</p>
                                <p style="font-size: 16px; color: #d1d5db;">${payload.message}</p>
                                ${linkStr}
                                <hr style="border-color: #374151; margin-top: 30px;" />
                                <p style="font-size: 12px; color: #9ca3af;">This is an automated notification from the PC Inventory System.</p>
                            </div>
                        `;
                        
                        // Fire and forget so we don't block
                        sendEmail(user[0].email, payload.title, html).catch(err => console.error('Error triggering email', err));
                    }
                } catch (emailErr) {
                    console.error('Failed to lookup user for email:', emailErr);
                }
            }

        } catch (error) {
            console.error('Failed to send notification:', error);
        }
    }

    /**
     * Start background job to check for task deadlines
     */
    startDeadlineChecker(intervalMinutes: number = 60) {
        if (this.interval) return;

        console.log(`✓ Task Deadline Checker started (every ${intervalMinutes} min)`);
        
        this.interval = setInterval(() => {
            this.checkDeadlines();
        }, intervalMinutes * 60 * 1000);

        // Initial check
        this.checkDeadlines();
    }

    stopDeadlineChecker() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
    }

    private async checkDeadlines() {
        try {
            // Find tasks due within the next 24 hours that haven't been notified yet
            // We might need a 'deadline_notified' flag in the tasks table to avoid duplicate alerts.
            // For simplicity in this PFE, we'll just check tasks due soon.
            
            const upcomingTasks = await dbAll(`
                SELECT t.id, t.title, t.end_date, ta.user_id 
                FROM tasks t
                JOIN task_assignments ta ON t.id = ta.task_id
                WHERE t.status != 'Closed' 
                AND t.end_date <= DATEADD(hour, 24, GETUTCDATE())
                AND t.end_date > GETUTCDATE()
            `);

            for (const task of upcomingTasks) {
                await this.sendNotification({
                    userId: task.user_id,
                    type: 'task_deadline',
                    severity: 'warning',
                    title: 'Upcoming Task Deadline',
                    message: `Task "${task.title}" is due in less than 24 hours.`,
                    link: `/admin/tasks?taskId=${task.id}`
                });
            }
        } catch (error) {
            console.error('Error checking task deadlines:', error);
        }
    }
}

export const notificationService = new NotificationService();

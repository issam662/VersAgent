import { Router, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { dbGet, dbAll, dbRun, runTransaction } from '../database/index.js';
import { createError } from '../middleware/errorHandler.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { logAudit } from '../middleware/audit.js';
import { notificationService } from '../services/notificationService.js';

const router = Router();

// Get all tasks with filters
router.get('/', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const { filter = 'team', status, importance, showDeleted } = req.query;
        const userId = req.user?.id;

        let query = `
            SELECT t.*, 
                   (SELECT COUNT(*) FROM task_subtasks WHERE task_id = t.id) as total_subtasks,
                   (SELECT COUNT(*) FROM task_subtasks WHERE task_id = t.id AND is_completed = 1) as completed_subtasks,
                   u.full_name as creator_name
            FROM tasks t
            LEFT JOIN users u ON t.created_by = u.id
            WHERE 1=1
        `;
        const params: any[] = [];

        // By default, exclude soft-deleted tasks
        if (showDeleted === 'true') {
            query += ` AND t.deleted_at IS NOT NULL`;
        } else {
            query += ` AND t.deleted_at IS NULL`;
        }

        if (filter === 'my' && userId) {
            query += ` AND t.id IN (SELECT task_id FROM task_assignments WHERE user_id = ?)`;
            params.push(userId);
        }

        if (status) {
            query += ` AND t.status = ?`;
            params.push(status);
        }

        if (importance) {
            query += ` AND t.importance_level = ?`;
            params.push(importance);
        }

        query += ` ORDER BY t.created_at DESC`;

        const tasks = await dbAll(query, params);

        // Fetch assignments for each task
        for (const task of tasks) {
            const assignments = await dbAll(`
                SELECT ta.user_id, u.full_name, u.avatar, u.username 
                FROM task_assignments ta
                JOIN users u ON ta.user_id = u.id
                WHERE ta.task_id = ?
            `, [task.id]);
            task.assigned_to = assignments;
        }

        res.json({ tasks });
    } catch (error) {
        next(error);
    }
});

// Get single task details
router.get('/:id', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const task = await dbGet(`
            SELECT t.*, u.full_name as creator_name 
            FROM tasks t 
            LEFT JOIN users u ON t.created_by = u.id 
            WHERE t.id = ?
        `, [req.params.id]);

        if (!task) throw createError('Task not found', 404);

        const subtasks = await dbAll(`
            SELECT s.*, 
                   (SELECT COUNT(*) FROM task_comments WHERE subtask_id = s.id) as comments_count
            FROM task_subtasks s
            WHERE s.task_id = ?
            ORDER BY s.created_at ASC
        `, [task.id]);
        
        const assignments = await dbAll(`
            SELECT ta.user_id, u.full_name, u.avatar, u.username 
            FROM task_assignments ta
            JOIN users u ON ta.user_id = u.id
            WHERE ta.task_id = ?
        `, [task.id]);

        const subtaskAssignments = await dbAll(`
            SELECT sa.subtask_id, sa.user_id, u.full_name, u.avatar, u.username 
            FROM subtask_assignments sa
            JOIN users u ON sa.user_id = u.id
            JOIN task_subtasks ts ON sa.subtask_id = ts.id
            WHERE ts.task_id = ?
        `, [task.id]);

        for (const subtask of subtasks) {
            subtask.assigned_to = subtaskAssignments
                .filter((sa: any) => sa.subtask_id === subtask.id)
                .map((sa: any) => ({
                    user_id: sa.user_id,
                    full_name: sa.full_name,
                    avatar: sa.avatar,
                    username: sa.username
                }));
        }

        task.subtasks = subtasks;
        task.assigned_to = assignments;

        res.json({ task });
    } catch (error) {
        next(error);
    }
});

// Create task
router.post('/', authenticate, authorize('SuperAdmin', 'Admin'), async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const { title, description, importance_level, status, start_date, end_date, assigned_to, subtasks } = req.body;

        if (!title || !importance_level) {
            throw createError('Title and importance level are required', 400);
        }

        const taskId = uuidv4();

        await runTransaction(async () => {
            // Insert task
            await dbRun(`
                INSERT INTO tasks (id, title, description, importance_level, status, start_date, end_date, created_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                taskId, 
                title, 
                description || null, 
                importance_level, 
                status || 'On Going', 
                start_date || null, 
                end_date || null, 
                req.user?.id
            ]);

            // Insert assignments
            if (assigned_to && Array.isArray(assigned_to)) {
                for (const userId of assigned_to) {
                    await dbRun('INSERT INTO task_assignments (task_id, user_id) VALUES (?, ?)', [taskId, userId]);
                    
                    // Create notification for assigned user
                    await notificationService.sendNotification({
                        userId: userId,
                        type: 'task_assignment',
                        severity: 'info',
                        title: 'New Task Assigned',
                        message: `You have been assigned to task: ${title}`,
                        link: `/admin/tasks?taskId=${taskId}`
                    });
                }
            }

            // Insert subtasks
            if (subtasks && Array.isArray(subtasks)) {
                for (const subtask of subtasks) {
                    const subtaskId = uuidv4();
                    await dbRun(`
                        INSERT INTO task_subtasks (id, task_id, title, is_completed)
                        VALUES (?, ?, ?, ?)
                    `, [subtaskId, taskId, subtask.title, subtask.is_completed ? 1 : 0]);

                    if (subtask.assigned_to && Array.isArray(subtask.assigned_to)) {
                        const mainTaskAssignees = assigned_to || [];
                        const validSubtaskAssignees = subtask.assigned_to
                            .map((user: any) => typeof user === 'string' ? user : user.user_id)
                            .filter((userId: string) => mainTaskAssignees.includes(userId));

                        for (const userId of validSubtaskAssignees) {
                            await dbRun('INSERT INTO subtask_assignments (subtask_id, user_id) VALUES (?, ?)', [subtaskId, userId]);
                        }
                    }
                }
            }
        });

        await logAudit(req.user?.id || null, req.user?.username || '', `Created task: ${title}`, 'task', taskId, null, req.body, req.ip || '', req.headers['user-agent'] || '');

        res.status(201).json({ id: taskId, message: 'Task created successfully' });
    } catch (error) {
        next(error);
    }
});

// Update task
router.put('/:id', authenticate, authorize('SuperAdmin', 'Admin'), async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const { title, description, importance_level, status, start_date, end_date, assigned_to, subtasks } = req.body;
        const taskId = req.params.id;

        const existingTask = await dbGet('SELECT * FROM tasks WHERE id = ?', [taskId]);
        if (!existingTask) throw createError('Task not found', 404);

        await runTransaction(async () => {
            // Update task main info
            await dbRun(`
                UPDATE tasks 
                SET title = COALESCE(?, title),
                    description = COALESCE(?, description),
                    importance_level = COALESCE(?, importance_level),
                    status = COALESCE(?, status),
                    start_date = ?,
                    end_date = ?,
                    updated_at = GETUTCDATE()
                WHERE id = ?
            `, [title, description, importance_level, status, start_date, end_date, taskId]);

            // Update assignments (clear and re-insert)
            if (assigned_to && Array.isArray(assigned_to)) {
                await dbRun('DELETE FROM task_assignments WHERE task_id = ?', [taskId]);
                for (const userId of assigned_to) {
                    await dbRun('INSERT INTO task_assignments (task_id, user_id) VALUES (?, ?)', [taskId, userId]);
                }
            }

            // Update subtasks using differential sync to preserve IDs
            if (subtasks && Array.isArray(subtasks)) {
                const dbSubtasks = await dbAll('SELECT id FROM task_subtasks WHERE task_id = ?', [taskId]);
                const dbSubtaskIds = dbSubtasks.map((s: any) => s.id);
                const payloadSubtaskIds = subtasks.map((s: any) => s.id);

                // 1. Delete subtasks not in the payload
                const toDelete = dbSubtaskIds.filter(id => !payloadSubtaskIds.includes(id));
                for (const subtaskId of toDelete) {
                    await dbRun('DELETE FROM task_subtasks WHERE id = ?', [subtaskId]);
                }

                // 2. Update existing or Insert new subtasks
                for (const subtask of subtasks) {
                    const isExisting = dbSubtaskIds.includes(subtask.id);
                    let currentSubtaskId = subtask.id;
                    
                    if (isExisting) {
                        await dbRun(`
                            UPDATE task_subtasks
                            SET title = ?,
                                is_completed = ?,
                                description = ?
                            WHERE id = ?
                        `, [subtask.title, subtask.is_completed ? 1 : 0, subtask.description || null, subtask.id]);
                    } else {
                        // Brand new subtask
                        currentSubtaskId = uuidv4();
                        await dbRun(`
                            INSERT INTO task_subtasks (id, task_id, title, is_completed, description)
                            VALUES (?, ?, ?, ?, ?)
                        `, [currentSubtaskId, taskId, subtask.title, subtask.is_completed ? 1 : 0, subtask.description || null]);
                    }

                    // Update subtask assignments
                    if (subtask.assigned_to && Array.isArray(subtask.assigned_to)) {
                        await dbRun('DELETE FROM subtask_assignments WHERE subtask_id = ?', [currentSubtaskId]);
                        
                        // Ensure that we only assign users who are also assigned to the main task
                        const mainTaskAssignees = assigned_to || [];
                        const validSubtaskAssignees = subtask.assigned_to
                            .map((user: any) => typeof user === 'string' ? user : user.user_id)
                            .filter((userId: string) => mainTaskAssignees.includes(userId));

                        for (const userId of validSubtaskAssignees) {
                            await dbRun('INSERT INTO subtask_assignments (subtask_id, user_id) VALUES (?, ?)', [currentSubtaskId, userId]);
                        }
                    } else if (subtask.assigned_to === null || (Array.isArray(subtask.assigned_to) && subtask.assigned_to.length === 0)) {
                        await dbRun('DELETE FROM subtask_assignments WHERE subtask_id = ?', [currentSubtaskId]);
                    }
                }
            }
        });

        const taskTitleToLog = title || existingTask.title;
        await logAudit(req.user?.id || null, req.user?.username || '', `Updated task: ${taskTitleToLog}`, 'task', taskId, existingTask, req.body, req.ip || '', req.headers['user-agent'] || '');

        res.json({ message: 'Task updated successfully' });
    } catch (error) {
        next(error);
    }
});

// Soft-delete task (sets deleted_at)
router.delete('/:id', authenticate, authorize('SuperAdmin', 'Admin'), async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const taskId = req.params.id;
        const task = await dbGet('SELECT title FROM tasks WHERE id = ? AND deleted_at IS NULL', [taskId]) as any;
        if (!task) throw createError('Task not found', 404);

        await dbRun('UPDATE tasks SET deleted_at = GETUTCDATE() WHERE id = ?', [taskId]);
        
        await logAudit(req.user?.id || null, req.user?.username || '', `Soft-deleted task: ${task.title}`, 'task', taskId, null, null, req.ip || '', req.headers['user-agent'] || '');

        res.json({ message: 'Task deleted successfully' });
    } catch (error) {
        next(error);
    }
});

// Restore soft-deleted task
router.patch('/:id/restore', authenticate, authorize('SuperAdmin', 'Admin'), async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const taskId = req.params.id;
        const task = await dbGet('SELECT title FROM tasks WHERE id = ? AND deleted_at IS NOT NULL', [taskId]) as any;
        if (!task) throw createError('Task not found or not deleted', 404);

        await dbRun('UPDATE tasks SET deleted_at = NULL, updated_at = GETUTCDATE() WHERE id = ?', [taskId]);
        
        await logAudit(req.user?.id || null, req.user?.username || '', `Restored task: ${task.title}`, 'task', taskId, null, null, req.ip || '', req.headers['user-agent'] || '');

        res.json({ message: 'Task restored successfully' });
    } catch (error) {
        next(error);
    }
});

// Get comments for a task
router.get('/:id/comments', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const taskId = req.params.id;
        const task = await dbGet('SELECT id FROM tasks WHERE id = ? AND deleted_at IS NULL', [taskId]);
        if (!task) throw createError('Task not found', 404);

        const comments = await dbAll(`
            SELECT tc.id, tc.task_id, tc.user_id, tc.content, tc.created_at,
                   u.full_name, u.username, u.avatar
            FROM task_comments tc
            JOIN users u ON tc.user_id = u.id
            WHERE tc.task_id = ? AND tc.subtask_id IS NULL
            ORDER BY tc.created_at ASC
        `, [taskId]);

        res.json({ comments });
    } catch (error) {
        next(error);
    }
});

// Post comment to a task
router.post('/:id/comments', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const taskId = req.params.id;
        const { content } = req.body;
        const userId = req.user?.id;

        if (!content || !content.trim()) {
            throw createError('Comment content is required', 400);
        }

        const task = await dbGet('SELECT id, title FROM tasks WHERE id = ? AND deleted_at IS NULL', [taskId]);
        if (!task) throw createError('Task not found', 404);

        const commentId = uuidv4();
        await dbRun(`
            INSERT INTO task_comments (id, task_id, user_id, content, created_at)
            VALUES (?, ?, ?, ?, GETUTCDATE())
        `, [commentId, taskId, userId, content.trim()]);

        await logAudit(req.user?.id || null, req.user?.username || '', `Added comment to task: ${task.title}`, 'task_comment', commentId, null, { content }, req.ip || '', req.headers['user-agent'] || '');

        res.status(201).json({ id: commentId, message: 'Comment added successfully' });
    } catch (error) {
        next(error);
    }
});

// Delete comment
router.delete('/:id/comments/:commentId', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const { id: taskId, commentId } = req.params;
        const userId = req.user?.id;
        const role = req.user?.role;

        const comment = await dbGet('SELECT user_id FROM task_comments WHERE id = ? AND task_id = ?', [commentId, taskId]);
        if (!comment) throw createError('Comment not found', 404);

        // Allow deletion if the user is the author or holds an administrative role
        const isAuthor = comment.user_id === userId;
        const isAdmin = role === 'SuperAdmin' || role === 'Admin';

        if (!isAuthor && !isAdmin) {
            throw createError('You are not authorized to delete this comment', 403);
        }

        await dbRun('DELETE FROM task_comments WHERE id = ?', [commentId]);

        await logAudit(req.user?.id || null, req.user?.username || '', `Deleted comment: ${commentId}`, 'task_comment', commentId, null, null, req.ip || '', req.headers['user-agent'] || '');

        res.json({ message: 'Comment deleted successfully' });
    } catch (error) {
        next(error);
    }
});

// Get comments for a subtask
router.get('/:id/subtasks/:subtaskId/comments', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const { id: taskId, subtaskId } = req.params;
        const subtask = await dbGet('SELECT id FROM task_subtasks WHERE id = ? AND task_id = ?', [subtaskId, taskId]);
        if (!subtask) throw createError('Subtask not found', 404);

        const comments = await dbAll(`
            SELECT tc.id, tc.task_id, tc.subtask_id, tc.user_id, tc.content, tc.created_at,
                   u.full_name, u.username, u.avatar
            FROM task_comments tc
            JOIN users u ON tc.user_id = u.id
            WHERE tc.task_id = ? AND tc.subtask_id = ?
            ORDER BY tc.created_at ASC
        `, [taskId, subtaskId]);

        res.json({ comments });
    } catch (error) {
        next(error);
    }
});

// Post comment to a subtask
router.post('/:id/subtasks/:subtaskId/comments', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const { id: taskId, subtaskId } = req.params;
        const { content } = req.body;
        const userId = req.user?.id;

        if (!content || !content.trim()) {
            throw createError('Comment content is required', 400);
        }

        const subtask = await dbGet('SELECT id FROM task_subtasks WHERE id = ? AND task_id = ?', [subtaskId, taskId]);
        if (!subtask) throw createError('Subtask not found', 404);

        const commentId = uuidv4();
        await dbRun(`
            INSERT INTO task_comments (id, task_id, subtask_id, user_id, content, created_at)
            VALUES (?, ?, ?, ?, ?, GETUTCDATE())
        `, [commentId, taskId, subtaskId, userId, content.trim()]);

        await logAudit(req.user?.id || null, req.user?.username || '', `Added comment to subtask: ${subtaskId}`, 'subtask_comment', commentId, null, { content }, req.ip || '', req.headers['user-agent'] || '');

        res.status(201).json({ id: commentId, message: 'Comment added successfully' });
    } catch (error) {
        next(error);
    }
});

export default router;

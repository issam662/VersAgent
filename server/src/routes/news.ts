import { Router, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { dbGet, dbAll, dbRun } from '../database/index.js';
import { createError } from '../middleware/errorHandler.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { logAudit } from '../middleware/audit.js';
import { config } from '../config.js';

const router = Router();
const uploadsDir = path.join(process.cwd(), config.uploadsDir, 'news');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`),
});
const upload = multer({ storage, limits: { fileSize: config.maxFileSize } });

// Get all news items
router.get('/', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const newsItems = await dbAll('SELECT * FROM news_items ORDER BY sort_order ASC, created_at DESC', []);
        res.json({ newsItems });
    } catch (error) {
        next(error);
    }
});

// Create news item
router.post('/', authenticate, authorize('SuperAdmin', 'Admin'), upload.single('image'), async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const { title, content, isActive, sortOrder, imageUrl, link } = req.body;
        if (!title) throw createError('Title required', 400);
        const id = uuidv4();
        // Support both file upload and URL
        const imagePath = req.file ? `/uploads/news/${req.file.filename}` : (imageUrl || null);
        await dbRun(
            'INSERT INTO news_items (id, title, content, image_path, is_active, sort_order, created_by, link) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [id, title, content || null, imagePath, isActive !== 'false' ? 1 : 0, parseInt(sortOrder) || 0, req.user?.id, link || null]
        );
        await logAudit(req.user?.id || null, req.user?.username || '', `Created news announcement: ${title}`, 'news_item', id, null, { title }, req.ip || '', req.headers['user-agent'] as string || '');
        res.status(201).json({ id, message: 'News created' });
    } catch (error) {
        next(error);
    }
});

// Update news item
router.put('/:id', authenticate, authorize('SuperAdmin', 'Admin'), upload.single('image'), async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const { title, content, isActive, sortOrder, imageUrl, link } = req.body;
        const old = await dbGet('SELECT * FROM news_items WHERE id = ?', [req.params.id]) as any;
        if (!old) throw createError('Not found', 404);

        let imagePath = old.image_path;
        if (req.file) {
            // Delete old file if it was uploaded (not a URL)
            if (old.image_path && old.image_path.startsWith('/uploads/') && fs.existsSync(path.join(process.cwd(), old.image_path))) {
                fs.unlinkSync(path.join(process.cwd(), old.image_path));
            }
            imagePath = `/uploads/news/${req.file.filename}`;
        } else if (imageUrl !== undefined) {
            // If imageUrl is provided (including empty string to clear), use it
            imagePath = imageUrl || null;
        }

        await dbRun(
            'UPDATE news_items SET title = ?, content = ?, image_path = ?, is_active = ?, sort_order = ?, link = ?, updated_at = GETUTCDATE() WHERE id = ?',
            [
                title !== undefined ? title : old.title,
                content !== undefined ? (content || null) : old.content,
                imagePath,
                isActive !== undefined ? (isActive === true || isActive === 'true' || isActive === 1 ? 1 : 0) : (old.is_active ? 1 : 0),
                sortOrder !== undefined ? parseInt(sortOrder) : old.sort_order,
                link !== undefined ? (link || null) : old.link,
                req.params.id
            ]
        );
        await logAudit(req.user?.id || null, req.user?.username || '', `Updated news announcement: ${old.title}`, 'news_item', req.params.id, old, req.body, req.ip || '', req.headers['user-agent'] as string || '');
        res.json({ message: 'Updated' });
    } catch (error) {
        next(error);
    }
});

// Delete news item
router.delete('/:id', authenticate, authorize('SuperAdmin', 'Admin'), async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const item = await dbGet('SELECT * FROM news_items WHERE id = ?', [req.params.id]) as any;
        // Only delete file if it's a local upload
        if (item?.image_path && item.image_path.startsWith('/uploads/') && fs.existsSync(path.join(process.cwd(), item.image_path))) {
            fs.unlinkSync(path.join(process.cwd(), item.image_path));
        }
        await dbRun('DELETE FROM news_items WHERE id = ?', [req.params.id]);
        await logAudit(req.user?.id || null, req.user?.username || '', `Deleted news announcement: ${item?.title || 'Unknown'}`, 'news_item', req.params.id, item, null, req.ip || '', req.headers['user-agent'] as string || '');
        res.json({ message: 'Deleted' });
    } catch (error) {
        next(error);
    }
});

export default router;

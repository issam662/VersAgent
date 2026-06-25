import 'dotenv/config';
// Force reload 2
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import fs from 'fs';

import { config } from './config.js';
import { initializeDatabase } from './database/index.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { requestLogger } from './middleware/requestLogger.js';

// Route imports
import authRoutes from './routes/auth.js';
import machinesRoutes from './routes/machines.js';
import rulesRoutes from './routes/rules.js';
import incidentsRoutes from './routes/incidents.js';
import newsRoutes from './routes/news.js';
import usersRoutes from './routes/users.js';
import auditRoutes from './routes/audit.js';
import publicRoutes from './routes/public.js';
import agentRoutes from './routes/agent.js';
import backupRoutes from './routes/backup.js';
import settingsRoutes from './routes/settings.js';
import scannerRoutes from './routes/scanner.js';
import dashboardRoutes from './routes/dashboard.js';
import printersRoutes from './routes/printers.js';
import vulnerabilitiesRoutes from './routes/vulnerabilities.js';
import layoutRoutes from './routes/layout.js';
import aiRoutes from './routes/ai.js';
import tasksRoutes from './routes/tasks.js';
import alertsRoutes from './routes/alerts.js';
import { startBackgroundPingService, stopBackgroundPingService } from './services/backgroundPing.js';
import { startBackgroundComplianceService, stopBackgroundComplianceService } from './services/compliance.js';
import { startBackgroundCveService, stopBackgroundCveService } from './services/cveService.js';
import { notificationService } from './services/notificationService.js';
import { startAutoBackupService, stopAutoBackupService } from './services/autoBackup.js';
import { Server as SocketServer } from 'socket.io';
import http from 'http';

const app = express();

// Shared online agents state — used by both IIS socket and fixed-port socket
const onlineAgents = new Map<string, { id: string; hostname: string; ip: string }>();
const connectedSockets = new Map<string, any>(); // Maps socket.id to actual socket object

const VERSIVIEW_AGENT_PORT = 3003;

function setupSocketIO(server: any) {
    const io = new SocketServer(server, {
        cors: { origin: "*", methods: ["GET", "POST"] },
        maxHttpBufferSize: 1e7 // 10MB limit for file transfers
    });

    io.on('connection', (socket) => {
        console.log(`[VersiView] New connection (IIS): ${socket.id}`);
        attachSocketHandlers(socket, io);
    });
}

function attachSocketHandlers(socket: any, io: SocketServer) {
    connectedSockets.set(socket.id, socket);

    socket.on('agent-register', (data: any) => {
        console.log(`[VersiView] Agent registered: ${data.hostname} (${data.ip})`);
        onlineAgents.set(socket.id, { id: socket.id, hostname: data.hostname, ip: data.ip });
        broadcastToAdmins('agent-list-update', Array.from(onlineAgents.values()));
    });

    socket.on('admin-register', () => {
        socket.join('admins');
        socket.emit('agent-list-update', Array.from(onlineAgents.values()));
    });

    socket.on('webrtc-offer', (data: any) => {
        const target = connectedSockets.get(data.target);
        if (target) target.emit('webrtc-offer', { offer: data.offer, caller: socket.id });
    });

    socket.on('webrtc-answer', (data: any) => {
        const target = connectedSockets.get(data.target);
        if (target) target.emit('webrtc-answer', { answer: data.answer });
    });

    socket.on('webrtc-ice-candidate', (data: any) => {
        const target = connectedSockets.get(data.target);
        if (target) target.emit('webrtc-ice-candidate', { candidate: data.candidate, caller: socket.id });
    });

    socket.on('webrtc-file-transfer', (data: any) => {
        const target = connectedSockets.get(data.target);
        if (target) target.emit('webrtc-file-transfer', data);
    });

    socket.on('disconnect', () => {
        connectedSockets.delete(socket.id);
        if (onlineAgents.has(socket.id)) {
            onlineAgents.delete(socket.id);
            broadcastToAdmins('agent-list-update', Array.from(onlineAgents.values()));
        }
    });
}

function broadcastToAdmins(event: string, data: any) {
    // Admins are connected to the IIS socket. Since we don't have a global reference
    // to all rooms across servers, we iterate connectedSockets to find admins.
    for (const [id, s] of connectedSockets.entries()) {
        if (s.rooms && s.rooms.has('admins')) {
            s.emit(event, data);
        }
    }
}

/**
 * Standalone fixed-port socket.io server for VersiView agents.
 * Agents always connect to this port (3003) regardless of IIS port changes.
 */
function startAgentSocketServer() {
    const agentHttpServer = http.createServer();
    const agentIo = new SocketServer(agentHttpServer, {
        cors: { origin: "*", methods: ["GET", "POST"] },
        maxHttpBufferSize: 1e7 // 10MB limit
    });
    agentIo.on('connection', (socket) => {
        console.log(`[VersiView] Agent socket connected (port ${VERSIVIEW_AGENT_PORT}): ${socket.id}`);
        attachSocketHandlers(socket, agentIo);
    });

    agentHttpServer.listen(VERSIVIEW_AGENT_PORT, '0.0.0.0', () => {
        console.log(`[VersiView] Agent socket server listening on port ${VERSIVIEW_AGENT_PORT}`);
    });
}

// Security middleware
app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' }
}));
app.use(cors({
    origin: true,
    credentials: true,
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // Limit each IP to 1000 requests per windowMs
    message: { error: 'Too many requests, please try again later' },
});
app.use('/api/', limiter);

// Agent endpoints get higher rate limit
const agentLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 60, // 1 request per second average
});
app.use('/api/agent/', agentLimiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use(requestLogger);

// Static files for uploads - with CORS headers
app.use('/uploads', (req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET');
    res.header('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
}, express.static(path.join(process.cwd(), config.uploadsDir)));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/machines', machinesRoutes);
app.use('/api/rules', rulesRoutes);
app.use('/api/incidents', incidentsRoutes);
app.use('/api/news', newsRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/agent', agentRoutes);
app.use('/api/backup', backupRoutes);
app.use('/api/scanner', scannerRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/printers', printersRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/vulnerabilities', vulnerabilitiesRoutes);
app.use('/api/layout', layoutRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/tasks', tasksRoutes);
app.use('/api/alerts', alertsRoutes);

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Serve React Frontend (Production) ─────────────────────────────────────
// Serves the built client/dist folder so the frontend and API share one port.
// This replaces the need for a separate Vite dev server on port 5173.
const clientDistPath = path.resolve(process.cwd(), '..', 'client', 'dist');
if (fs.existsSync(clientDistPath)) {
    console.log('✓ Serving React frontend from:', clientDistPath);
    app.use(express.static(clientDistPath));
    // Catch-all: send index.html for any non-API route (supports React Router)
    app.get('*', (req, res, next) => {
        if (req.path.startsWith('/api')) return next();
        res.sendFile(path.join(clientDistPath, 'index.html'));
    });
} else {
    console.warn('! client/dist not found - run "npm run build" in the client folder to enable frontend serving.');
}

// 404 handler for unknown routes
app.use(notFound);

// Error handling
app.use(errorHandler);

// Initialize and start server
async function start() {
    try {
        // Initialize database
        await initializeDatabase();
        console.log('✓ Database initialized');

        // Start background services
        startBackgroundPingService(60); // Ping every 60 minutes
        startBackgroundComplianceService(15); // Evaluate compliance every 15 minutes
        startBackgroundCveService(24); // Sync CVEs daily
        notificationService.startDeadlineChecker(60); // Check deadlines every hour
        startAutoBackupService(); // Daily auto-backup at 19:00

        const https = await import('https');
        const fs = await import('fs');
        const path = await import('path');
        const fileUrlToPath = (await import('url')).fileURLToPath;
        const __dirname = path.dirname(fileUrlToPath(import.meta.url));

        let server;
        const certPath = path.join(__dirname, '..', 'certs.pfx');

        if (fs.existsSync(certPath)) {
            console.log('✓ SSL Certificate found, starting HTTPS server');
            const options = {
                pfx: fs.readFileSync(certPath),
                passphrase: 'password'
            };
            server = https.createServer(options, app).listen(config.port, '0.0.0.0', () => {
                console.log(`
╔═══════════════════════════════════════════════════════════╗
║                 VersAgent - API Server (HTTPS)            ║
╠═══════════════════════════════════════════════════════════╣
║  ► Status:  Running                                       ║
║  ► URL:     https://${config.host}:${config.port}                       ║
║  ► Mode:    ${config.nodeEnv.padEnd(44)}║
╚═══════════════════════════════════════════════════════════╝
                `);
            });
            setupSocketIO(server);
            startAgentSocketServer();
        } else {
            console.log('! No SSL Certificate found, falling back to HTTP');
            server = app.listen(config.port, '0.0.0.0', () => {
                console.log(`
╔═══════════════════════════════════════════════════════════╗
║                 VersAgent - API Server (HTTP)             ║
╠═══════════════════════════════════════════════════════════╣
║  ► Status:  Running                                       ║
║  ► URL:     http://${config.host}:${config.port}                        ║
║  ► Mode:    ${config.nodeEnv.padEnd(44)}║
╚═══════════════════════════════════════════════════════════╝
                `);
            });
            setupSocketIO(server);
            startAgentSocketServer();
        }

        // Graceful shutdown
        const shutdown = async (signal: string) => {
            console.log(`\n\n[${signal}] Shutting down gracefully...`);
            server.close(async () => {
                console.log('✓ HTTP server closed');
                try {
                    const { closeDatabase } = await import('./database/index.js');
                    closeDatabase();
                    console.log('✓ Database connection closed');

                    stopBackgroundPingService();
                    stopBackgroundComplianceService();
                    stopBackgroundCveService();
                    notificationService.stopDeadlineChecker();
                    stopAutoBackupService();
                    console.log('✓ Background services stopped');

                    process.exit(0);
                } catch (err) {
                    console.error('Error during database closure:', err);
                    process.exit(1);
                }
            });

            // Force exit if shutdown takes too long
            setTimeout(() => {
                console.error('Could not close connections in time, forcefully shutting down');
                process.exit(1);
            }, 5000);
        };

        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));

    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

// Global error handlers
process.on('uncaughtException', (err) => {
    console.error('[CRITICAL] Uncaught Exception:', err);
    // Note: In production, consider restart via process manager (PM2/Docker)
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('[CRITICAL] Unhandled Rejection at:', promise, 'reason:', reason);
});

start();

export default app;

// Server Configuration
export const config = {
    // Server
    port: (() => {
        const p = parseInt(process.env.PORT || '3002');
        console.log('[CONFIG DEBUG] Raw process.env.PORT:', process.env.PORT);
        console.log('[CONFIG DEBUG] Resolved config.port:', p);
        return p;
    })(),
    host: process.env.HOST || 'localhost',
    nodeEnv: process.env.NODE_ENV || 'development',

    // Database

    dbServer: process.env.DB_SERVER || 'EUMOOUJ-DB01',
    dbName: process.env.DB_NAME || 'IT_Applications',
    dbUser: process.env.DB_USER || 'Issam_IT',
    dbPassword: process.env.DB_PASSWORD || 'issam123',
    dbEncrypt: process.env.DB_ENCRYPT === 'true',

    // Authentication
    jwtSecret: process.env.JWT_SECRET || 'aptiv-inventory-secret-change-in-production',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '30m',
    sessionTimeoutMinutes: parseInt(process.env.SESSION_TIMEOUT || '30'),

    // Security
    bruteForceMaxAttempts: parseInt(process.env.BRUTE_FORCE_MAX || '5'),
    bruteForceWindowMinutes: parseInt(process.env.BRUTE_FORCE_WINDOW || '10'),

    // Agent
    heartbeatIntervalSeconds: parseInt(process.env.HEARTBEAT_INTERVAL || '60'),
    onlineThresholdMinutes: parseInt(process.env.ONLINE_THRESHOLD || '5'),

    // Data Retention (months)
    eventsRetentionMonths: parseInt(process.env.EVENTS_RETENTION || '6'),
    inventoryRetentionMonths: parseInt(process.env.INVENTORY_RETENTION || '3'),
    auditRetentionMonths: parseInt(process.env.AUDIT_RETENTION || '12'),

    // File Uploads
    uploadsDir: process.env.UPLOADS_DIR || './uploads',
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '5242880'), // 5MB

    // Backups
    backupsDir: process.env.BACKUPS_DIR || './backups',

    // AI / Ollama
    ollamaUrl: process.env.OLLAMA_URL || 'http://localhost:11434',
    ollamaModel: process.env.OLLAMA_MODEL || 'gemma:2b'
};

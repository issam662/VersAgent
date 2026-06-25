import path from 'path';
import fs from 'fs';
import { app } from 'electron';

// Read version from package.json at runtime to avoid hardcoded stale fallbacks
function getPackageVersion(): string {
    try {
        // In packaged app, package.json is at app root (inside asar)
        const pkgPath = path.join(app?.getAppPath?.() || __dirname, '..', 'package.json');
        if (fs.existsSync(pkgPath)) {
            const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
            return pkg.version || '0.0.0';
        }
    } catch { /* ignore */ }
    return '0.0.0';
}

// Default config
const DEFAULTS = {
    serverUrl: 'https://10.71.12.140:3002/api',
    apiKey: 'aptiv-agent-key-2024-secure-token-x9k2m',
    heartbeatIntervalMs: 60 * 1000,       // 60 seconds
    inventoryIntervalMs: 30 * 60 * 1000,   // 30 minutes
    infoPagePollIntervalMs: 5 * 60 * 1000, // 5 minutes
    scanIntervalHours: 4,
    debug: false,
    version: app?.getVersion?.() || getPackageVersion(),
    category: 'Unassigned',
    rejectUnauthorized: false, // Default to false for internal self-signed certs
    dbServer: 'EUMOOUJ-DB01',
    dbName: 'IT_Applications',
    dbUser: 'Issam_IT',
    dbPassword: 'issam123',
    isBlocked: false,
    blockReason: '',
    pendingUnblockSync: false
};

interface AgentConfig {
    serverUrl: string;
    apiKey: string;
    heartbeatIntervalMs: number;
    inventoryIntervalMs: number;
    infoPagePollIntervalMs: number;
    version: string;
    agentId?: string;
    machineId?: string;
    category?: string;
    department?: string;
    location?: string;
    family?: string;
    dbServer?: string;
    dbName?: string;
    dbUser?: string;
    dbPassword?: string;
    rejectUnauthorized?: boolean;
    scanIntervalHours: number;
    debug: boolean;
    isBlocked?: boolean;
    blockReason?: string;
    pendingUnblockSync?: boolean;
}

let config: AgentConfig = { ...DEFAULTS };

function getConfigPath(): string {
    const userDataPath = app?.getPath?.('userData') || path.join(process.env.APPDATA || '', 'VersAgent');
    return path.join(userDataPath, 'agent-config.json');
}

export function loadConfig(): AgentConfig {
    const userDataPath = app?.getPath?.('userData') || path.join(process.env.APPDATA || '', 'VersAgent');
    const logPath = path.join(userDataPath, 'agent_debug.log');
    const log = (msg: string) => {
        const entry = `[${new Date().toISOString()}] [CONFIG] ${msg}\n`;
        try {
            fs.appendFileSync(logPath, entry);
        } catch (e) {
            console.error('[CONFIG_LOG_FAIL]', e);
        }
    };

    try {
        log('--- loadConfig Start ---');

        // v1.1.16 FIX: Always read version FRESH at runtime (not from DEFAULTS which is evaluated at import time).
        // At import time, app.getVersion() may return undefined if Electron isn't ready yet.
        // By the time loadConfig() runs, the app is initialized and getVersion() works correctly.
        const currentVersion = app?.getVersion?.() || getPackageVersion();
        log(`Current app version (from binary): ${currentVersion}`);

        const configPath = getConfigPath();
        log(`Persistent config path: ${configPath}`);
        if (fs.existsSync(configPath)) {
            const saved = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            // CRITICAL: Override saved version with the LIVE version from the binary.
            // The saved config may have a stale version from a previous installation.
            config = { ...DEFAULTS, ...saved, version: currentVersion };
            log(`Loaded persistent config. Category: ${config.category}, version overridden to: ${currentVersion}`);
        } else {
            config = { ...DEFAULTS, version: currentVersion };
            log('Persistent config not found. Using defaults.');
        }

        // Read setup-config.json from install directory (written by NSIS installer)
        // v1.0.53 FIX: ConfigPageLeave writes to TEMP with correct values; CopyFiles to INSTDIR may fail.
        // Search TEMP FIRST (with the actual filename used by the installer), then fall back to other locations.
        const exePath = app?.getPath?.('exe') ? path.dirname(app.getPath('exe')) : null;
        const tempDir = process.env.TEMP || process.env.TMP || '';
        const setupConfigPaths = [
            // v1.0.62 FIX: Priority shift - Installation directory is the single source of truth for the installer
            path.join(process.resourcesPath || '', '..', 'setup-config.json'),
            exePath ? path.join(exePath, 'setup-config.json') : null,
            'C:\\Program Files\\VersAgent\\setup-config.json',
            'C:\\Program Files (x86)\\VersAgent\\setup-config.json',
            path.join(process.env.LOCALAPPDATA || '', 'Programs', 'versagent', 'setup-config.json'),
            // FALLBACK: User TEMP (less reliable across elevation boundaries)
            path.join(tempDir, 'aptiv-setup-config.json'),
        ].filter(Boolean) as string[];

        log(`Checking setup-config.json in ${setupConfigPaths.length} locations...`);
        for (const setupPath of setupConfigPaths) {
            log(`- Checking: ${setupPath}`);
            try {
                if (fs.existsSync(setupPath)) {
                    log(`FOUND setup-config.json at: ${setupPath}`);
                    const content = fs.readFileSync(setupPath, 'utf8');
                    log(`Setup data RAW: ${content}`);
                    const setupData = JSON.parse(content);
                    applySetupValues(setupData, log);
                    break;
                }
            } catch (e) {
                log(`Error reading setup path ${setupPath}: ${e}`);
            }
        }

        // v1.0.64 FIX: Check Registry for latest installer values (Most reliable bridge)
        try {
            log('Checking Registry for installer values...');
            const { execSync } = require('child_process');
            const regPath = 'HKLM\\Software\\VersAgent';

            const getRegValue = (key: string) => {
                try {
                    const out = execSync(`reg query "${regPath}" /v "${key}"`, { encoding: 'utf8' });
                    const match = out.match(new RegExp(`${key}\\s+REG_SZ\\s+(.*)`));
                    return match ? match[1].trim() : null;
                } catch (e) { return null; }
            };

            const regCategory = getRegValue('Category');
            const regServerUrl = getRegValue('ServerUrl');
            const regDbServer = getRegValue('DbServer');
            const regDept = getRegValue('Department');
            const regLoc = getRegValue('Location');
            const regFamily = getRegValue('Family');
            const regReject = getRegValue('RejectUnauthorized');

            if (regCategory || regServerUrl || regDbServer || regDept || regLoc || regFamily || regReject !== null) {
                log(`FOUND values in Registry. Cat: ${regCategory}, SSL Reject: ${regReject}`);
                const regData = {
                    category: regCategory,
                    serverUrl: regServerUrl,
                    dbServer: regDbServer,
                    department: regDept,
                    location: regLoc,
                    family: regFamily,
                    rejectUnauthorized: regReject === '1'
                };
                applySetupValues(regData, log);
            }
        } catch (regErr) {
            log(`Registry check failed: ${regErr}`);
        }

        log('--- loadConfig End ---');
    } catch (err) {
        log(`CRITICAL: loadConfig failed: ${err}`);
        console.error('[CONFIG] Failed to load config:', err);
    }
    return config;
}

function applySetupValues(setupData: any, log: (msg: string) => void) {
    // Override existing config with setup values
    if (setupData.serverUrl) {
        config.serverUrl = setupData.serverUrl.trim();
        log(`Server URL updated: ${config.serverUrl}`);
    }
    if (setupData.dbServer) {
        config.dbServer = setupData.dbServer.trim();
        log(`DB Server updated: ${config.dbServer}`);
    }
    if (setupData.rejectUnauthorized !== undefined) {
        config.rejectUnauthorized = setupData.rejectUnauthorized;
        log(`SSL Verification updated: ${config.rejectUnauthorized}`);
    }
    if (setupData.category) {
        log(`Category update detected (${config.category} -> ${setupData.category}).`);
        config.category = setupData.category.trim();
        // v1.0.87 FIX: Do NOT reset sub-fields to 'Unassigned' when missing from payload.
        // The installer now carries over existing values from the registry.
        // Only clear sub-fields if the category actually changed to a different type.
    }
    if (setupData.department) {
        config.department = setupData.department.trim();
        log(`Department updated: ${config.department}`);
    }
    if (setupData.location) {
        config.location = setupData.location.trim();
        log(`Location updated: ${config.location}`);
    }
    if (setupData.family) {
        config.family = setupData.family.trim();
        log(`Family updated: ${config.family}`);
    }
    saveConfig(config);
}

export function saveConfig(updates: Partial<AgentConfig>): void {
    try {
        config = { ...config, ...updates };
        const configPath = getConfigPath();
        const dir = path.dirname(configPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        // v1.1.16 FIX: Never persist the version field to disk.
        // Version must always be read fresh from the binary (app.getVersion / package.json).
        // Persisting it causes stale versions to survive across upgrades.
        const { version, ...configWithoutVersion } = config;
        fs.writeFileSync(configPath, JSON.stringify(configWithoutVersion, null, 2));
    } catch (err) {
        console.error('[CONFIG] Failed to save config:', err);
    }
}

export function getConfig(): AgentConfig {
    return config;
}

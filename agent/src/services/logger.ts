import fs from 'fs';
import path from 'path';
import { app } from 'electron';

export function getLogPath(): string {
    const userDataPath = app?.getPath?.('userData') || path.join(process.env.APPDATA || '', 'APTIV System Service');
    return path.join(userDataPath, 'agent_debug.log');
}

export function logToAgent(module: string, msg: string) {
    const logPath = getLogPath();
    const entry = `[${new Date().toISOString()}] [${module}] ${msg}\n`;
    try {
        const dir = path.dirname(logPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.appendFileSync(logPath, entry);
    } catch (e) {
        // console.log fallback
        console.log(`[LOG_ERROR] ${module}: ${msg}`);
    }
}

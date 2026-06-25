import { dbAll, dbRun } from '../database/index.js';
import { ping } from './scanner.js';
import { config } from '../config.js';

let pingInterval: NodeJS.Timeout | null = null;
let statusInterval: NodeJS.Timeout | null = null;

/**
 * Marks managed machines as offline if they haven't checked in recently.
 */
async function checkManagedStatus() {
    try {
        const thresholdMinutes = config.onlineThresholdMinutes || 5;
        const result = await dbRun(`
            UPDATE machines 
            SET status = 'offline' 
            WHERE is_managed = 1 
              AND is_archived = 0 
              AND status = 'online' 
              AND last_seen < DATEADD(minute, -?, GETUTCDATE())
        `, [thresholdMinutes]);
        
        if (result.changes > 0) {
            console.log(`[STATUS CHECK] Marked ${result.changes} managed machines as offline (inactive for >${thresholdMinutes}m)`);
        }
    } catch (error) {
        console.error('[STATUS CHECK] Error updating managed status:', error);
    }
}

/**
 * Pings all unmanaged machines to update their live status.
 */
async function pingAllUnmanaged() {
    try {
        // Mark managed machines as offline first (quick DB check)
        await checkManagedStatus();

        // Get all unmanaged machines with their IP addresses
        const unmanaged = await dbAll(`
            SELECT m.id, ni.ip_address 
            FROM machines m 
            JOIN network_interfaces ni ON m.id = ni.machine_id 
            WHERE m.is_managed = 0 AND m.is_archived = 0 AND ni.ip_address IS NOT NULL
        `) as any[];

        if (unmanaged.length === 0) return;

        console.log(`[BACKGROUND PING] Starting ping for ${unmanaged.length} unmanaged devices...`);

        // Use a small chunk size and delay to avoid network congestion
        const CHUNK_SIZE = 5;
        for (let i = 0; i < unmanaged.length; i += CHUNK_SIZE) {
            const chunk = unmanaged.slice(i, i + CHUNK_SIZE);

            await Promise.all(chunk.map(async (machine) => {
                const isAlive = await ping(machine.ip_address);
                if (isAlive) {
                    await dbRun("UPDATE machines SET last_seen = GETUTCDATE(), status = 'online' WHERE id = ?", [machine.id]);
                } else {
                    await dbRun("UPDATE machines SET status = 'offline' WHERE id = ?", [machine.id]);
                }
            }));

            // Small delay between chunks
            if (i + CHUNK_SIZE < unmanaged.length) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }

        console.log(`[BACKGROUND PING] Finished pinging unmanaged devices.`);
    } catch (error) {
        console.error('[BACKGROUND PING] Error in background ping service:', error);
    }
}

/**
 * Starts the background ping service.
 * @param intervalMinutes Frequency of pings in minutes.
 */
export function startBackgroundPingService(intervalMinutes: number = 10) {
    if (pingInterval) return;

    // Run immediately on start
    pingAllUnmanaged();

    // Set up interval for unmanaged pings (heavy)
    pingInterval = setInterval(pingAllUnmanaged, intervalMinutes * 60 * 1000);

    // Set up a more frequent interval for managed status check (light DB query)
    statusInterval = setInterval(checkManagedStatus, 2 * 60 * 1000);

    console.log(`✓ Background ping service started (Pings every ${intervalMinutes}m, Status check every 2m)`);
}

/**
 * Stops the background ping service.
 */
export function stopBackgroundPingService() {
    if (pingInterval) {
        clearInterval(pingInterval);
        pingInterval = null;
    }
    if (statusInterval) {
        clearInterval(statusInterval);
        statusInterval = null;
    }
}

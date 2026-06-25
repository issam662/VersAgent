
import { initializeDatabase, dbAll, closeDatabase, dbGet } from './dist/database/index.js';
import { config } from './dist/config.js';

async function testQuery() {
    try {
        await initializeDatabase();

        console.log('Testing Machines Query with Pagination...');

        const limit = 50;
        const page = 1;
        const offset = (page - 1) * limit;

        let query = `
      SELECT m.*, mm.category, mm.location, mm.description, mm.tags
      FROM machines m
      LEFT JOIN machine_metadata mm ON m.id = mm.machine_id
      WHERE 1=1
    `;

        // Add archiving filter
        query += ' AND m.is_archived = 0';

        // Add ordering
        query += ' ORDER BY m.hostname ASC';

        // Add pagination
        query += ` OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY`;

        console.log('Query:', query);

        const machines = await dbAll(query, []);
        console.log(`Result Count: ${machines.length}`);

        if (machines.length > 0) {
            console.log('Enriching machines...');
            const enrichedMachines = await Promise.all(machines.map(async machine => {
                try {
                    // console.log(`Enriching ${machine.hostname}...`);
                    const nic = await dbGet('SELECT TOP 1 ip_address, mac_address FROM network_interfaces WHERE machine_id = ? ORDER BY updated_at DESC', [machine.id]);

                    const hasHeartbeat = machine.last_heartbeat && new Date(machine.last_heartbeat).getTime() > (Date.now() - config.onlineThresholdMinutes * 60 * 1000);
                    const isRecentPing = machine.last_seen && new Date(machine.last_seen).getTime() > (Date.now() - 15 * 60 * 1000);

                    let lastSeenType = null;
                    if (hasHeartbeat) lastSeenType = 'Heartbeat';
                    else if (isRecentPing) lastSeenType = 'Ping';

                    return {
                        ...machine,
                        lastKnownIp: nic?.ip_address || null,
                        lastSeenType
                    };
                } catch (e) {
                    console.error(`Enrichment failed for ${machine.hostname}:`, e);
                    throw e;
                }
            }));
            console.log('Enriched successfully.');
            console.log('First Enriched:', enrichedMachines[0]);
        } else {
            console.log('No machines returned.');
        }

    } catch (err) {
        console.error('Query Failed:', err);
    } finally {
        await closeDatabase();
    }
}

testQuery();

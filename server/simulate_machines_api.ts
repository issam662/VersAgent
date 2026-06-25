import 'dotenv/config';
import { initializeDatabase, dbAll, dbGet } from './src/database/index.js';
import { config } from './src/config.js';

async function simulate() {
    await initializeDatabase();

    const archived = 'false';
    const page = '1';
    const limit = '50';

    let query = `
      SELECT m.*, mm.category, mm.location, mm.description, mm.tags
      FROM machines m
      LEFT JOIN machine_metadata mm ON m.id = mm.machine_id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (archived !== 'true') query += ' AND m.is_archived = 0';

    query += ' ORDER BY m.hostname ASC';
    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);
    query += ` OFFSET ${offset} ROWS FETCH NEXT ${parseInt(limit as string)} ROWS ONLY`;

    console.log('Query:', query);

    try {
        const machines = await dbAll(query, params) as any[];
        console.log('Found machines:', machines.length);

        const enrichedMachines = await Promise.all(machines.map(async machine => {
            console.log('Processing machine:', machine.id);
            const nic = await dbGet('SELECT TOP 1 ip_address, mac_address FROM network_interfaces WHERE machine_id = ? ORDER BY updated_at DESC', [machine.id]) as any;

            let status = machine.status || 'offline';

            const hasHeartbeat = machine.last_heartbeat && new Date(machine.last_heartbeat).getTime() > (Date.now() - config.onlineThresholdMinutes * 60 * 1000);
            const isRecentPing = machine.last_seen && new Date(machine.last_seen).getTime() > (Date.now() - 15 * 60 * 1000);

            let lastSeenType: string | null = null;
            if (hasHeartbeat) lastSeenType = 'Heartbeat';
            else if (isRecentPing) lastSeenType = 'Ping';

            let parsedTags = [];
            try {
                parsedTags = machine.tags ? JSON.parse(machine.tags) : [];
            } catch (e) {
                console.error(`Failed to parse tags for machine ${machine.id}:`, e);
            }

            return {
                ...machine,
                isOnline: status === 'online',
                status,
                lastSeenType,
                lastKnownIp: nic?.ip_address || null,
                tags: parsedTags,
                ramGb: machine.ram_gb,
                diskGb: machine.disk_gb,
                lastHeartbeat: machine.last_heartbeat,
                createdAt: machine.created_at,
                updatedAt: machine.updated_at,
                macAddress: nic?.mac_address || null,
                ipAddress: nic?.ip_address || null,
                operatingSystem: machine.operating_system,
                isManaged: machine.is_managed
            };
        }));

        console.log('Enriched machines:', JSON.stringify(enrichedMachines, null, 2));
    } catch (err: any) {
        console.error('Simulation failed:', err.message);
        console.error(err);
    }

    process.exit(0);
}

simulate().catch(err => {
    console.error(err);
    process.exit(1);
});

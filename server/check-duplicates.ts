import { initializeDatabase, dbAll } from './src/database/index.js';
import * as fs from 'fs';

async function main() {
    await initializeDatabase();

    const output: any = {};
    const machines = await dbAll("SELECT id, hostname, serial_number, agent_id, is_managed, created_at, last_seen FROM machines WHERE hostname = 'DL39QT994'");
    output.machines = machines;

    for (const m of machines) {
        const nics = await dbAll("SELECT id, mac_address, ip_address, mapping_source FROM network_interfaces WHERE machine_id = ?", [m.id]);
        output[`nics_${m.id}`] = nics;
    }

    fs.writeFileSync('db_dump_actual.json', JSON.stringify(output, null, 2));
    process.exit(0);
}

main().catch(console.error);

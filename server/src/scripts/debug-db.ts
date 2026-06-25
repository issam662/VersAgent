
import dotenv from 'dotenv';
dotenv.config();
import { initializeDatabase, dbAll, closeDatabase } from '../database/index.js';
import { config } from '../config.js';

async function run() {
    try {
        console.log('1. script start');
        await initializeDatabase();
        console.log('2. db initialized');

        console.log('\n--- MACHINES ---');
        const machines = await dbAll('SELECT id, hostname, agent_id, status FROM machines');
        console.log(JSON.stringify(machines, null, 2));

        console.log('\n--- NETWORK INTERFACES ---');
        const nics = await dbAll('SELECT id, machine_id, mac_address, ip_address FROM network_interfaces');
        console.log(JSON.stringify(nics, null, 2));

        await closeDatabase();
        console.log('3. done');
    } catch (error) {
        console.error('ERROR:', error);
    }
}

run();

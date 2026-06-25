import 'dotenv/config';
import { initializeDatabase, closeDatabase } from './src/database/index.js';
import { evaluateMachineCompliance } from './src/services/compliance.js';

async function testCompliance() {
    await initializeDatabase();
    console.log('Database initialized. Running compliance evaluation for all machines...');

    // Hardcoded machine ID from the agent logs
    const machineId = '3d62f393-55d2-4b9d-a9a9-456caef92e02';
    await evaluateMachineCompliance(machineId);

    console.log('Done.');
    await closeDatabase();
}

testCompliance();

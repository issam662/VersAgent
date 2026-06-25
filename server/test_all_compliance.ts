import 'dotenv/config';
import { initializeDatabase, closeDatabase } from './src/database/index.js';
import { evaluateAllMachinesCompliance } from './src/services/compliance.js';

async function testAllCompliance() {
    await initializeDatabase();
    console.log('Database initialized. Running compliance evaluation for all machines...');

    await evaluateAllMachinesCompliance();

    console.log('Done.');
    await closeDatabase();
}

testAllCompliance();

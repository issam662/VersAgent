import 'dotenv/config';
import { initializeDatabase, dbAll, dbGet } from './src/database/index.js';

async function diagnose() {
    await initializeDatabase();

    console.log('--- Database Diagnostic ---');

    const count = await dbGet('SELECT COUNT(*) as count FROM machines');
    console.log('Total machines in DB:', count.count);

    const archivedCount = await dbGet('SELECT COUNT(*) as count FROM machines WHERE is_archived = 1');
    console.log('Archived machines:', archivedCount.count);

    const nonArchivedCount = await dbGet('SELECT COUNT(*) as count FROM machines WHERE is_archived = 0');
    console.log('Non-archived machines (is_archived = 0):', nonArchivedCount.count);

    const nullArchivedCount = await dbGet('SELECT COUNT(*) as count FROM machines WHERE is_archived IS NULL');
    console.log('Machines with NULL is_archived:', nullArchivedCount.count);

    const samples = await dbAll('SELECT TOP 5 id, hostname, is_archived, status FROM machines');
    console.log('Sample machines:', JSON.stringify(samples, null, 2));

    // Test the exact query from machines.ts
    // query += ' AND m.is_archived = 0';
    const testQuery = "SELECT m.* FROM machines m WHERE m.is_archived = 0 ORDER BY m.hostname ASC OFFSET 0 ROWS FETCH NEXT 50 ROWS ONLY";
    try {
        const results = await dbAll(testQuery);
        console.log('Results from machines.ts logic query:', results.length);
    } catch (e: any) {
        console.error('Test query failed:', e.message);
    }

    process.exit(0);
}

diagnose().catch(err => {
    console.error(err);
    process.exit(1);
});

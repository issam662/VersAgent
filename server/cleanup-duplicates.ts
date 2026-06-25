import { initializeDatabase, dbAll, dbRun } from './src/database/index.js';

async function cleanupDuplicates() {
    await initializeDatabase();

    // Find machines with the same hostname
    const duplicates = await dbAll(`
        SELECT hostname, COUNT(*) as count 
        FROM machines 
        GROUP BY hostname 
        HAVING COUNT(*) > 1
    `);

    console.log(`Found ${duplicates.length} duplicate hostnames.`);

    for (const dup of duplicates) {
        // Get all except the most recently seen one
        const machines = await dbAll(`
            SELECT id, last_seen FROM machines 
            WHERE hostname = ? 
            ORDER BY last_seen DESC
        `, [dup.hostname]);

        // Keep the first (most recent), delete the rest
        // Note: DELETE ON CASCADE handles machine_metadata and network_interfaces automatically
        for (let i = 1; i < machines.length; i++) {
            console.log(`Deleting obsolete duplicate machine ${machines[i].id} for hostname ${dup.hostname}`);
            await dbRun('DELETE FROM machines WHERE id = ?', [machines[i].id]);
        }
    }
    console.log("Cleanup complete");
    process.exit(0);
}

cleanupDuplicates().catch(console.error);

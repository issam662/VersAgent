import { initializeDatabase, dbGet, dbAll, closeDatabase } from './src/database/index.js';

async function verifyWindowsMatch() {
    await initializeDatabase();
    try {
        // Find exactly what Microsoft calls Windows 10 in our NVD copy
        const r = await dbAll(`SELECT product, COUNT(*) as c FROM cve_affected_software WHERE vendor='microsoft' AND product LIKE '%windows%' GROUP BY product`);
        console.log("Found MS Windows Variants in NVD rules:", r);

        // Check our machines table
        const os = await dbAll(`SELECT id, hostname, os_name, os_version FROM machines WHERE os_name LIKE '%window%'`);
        console.log("Local Machines:", os);

    } finally {
        await closeDatabase();
    }
}
verifyWindowsMatch();

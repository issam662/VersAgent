import { initializeDatabase, closeDatabase } from './src/database/index.js';
import { evaluateAllMachinesVulnerabilities } from './src/services/cveService.js';

async function testEval() {
    await initializeDatabase();
    console.log("Database initialized. Running manual global evaluation...");

    try {
        await evaluateAllMachinesVulnerabilities();
        console.log("Evaluation complete. Check machine_vulnerabilities in the DB or the frontend UI.");
    } catch (e) {
        console.error("Eval failed:", e);
    } finally {
        await closeDatabase();
    }
}

testEval();

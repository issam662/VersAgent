import { dbRun, dbAll, initializeDatabase } from './database/index.js';

async function runMigration() {
    try {
        console.log('Initializing database...');
        await initializeDatabase();
        console.log('Starting migration to fix old audit logs...');
        
        // Find all tasks
        const tasks = await dbAll('SELECT id, title FROM tasks', []);
        console.log(`Found ${tasks.length} tasks.`);
        
        let updateCount = 0;
        
        for (const task of tasks) {
            // Update "Updated task: <uuid>" to "Updated task: <title>"
            // Update "Created task: <uuid>" to "Created task: <title>" (if any)
            const result = await dbRun(`
                UPDATE audit_logs
                SET action = REPLACE(action, ?, ?)
                WHERE entity_type = 'task' AND action LIKE '%' + ? + '%'
            `, [task.id, task.title, task.id]);
            
            // Assuming we don't have result rows affected from dbRun, but it will do the job.
            updateCount++;
        }
        
        console.log('Migration completed.');
        process.exit(0);
    } catch (e) {
        console.error('Migration failed:', e);
        process.exit(1);
    }
}

runMigration();

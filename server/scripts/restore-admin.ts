import 'dotenv/config';
import { initializeDatabase, dbRun, closeDatabase } from '../src/database';

async function restoreAdmin() {
    try {
        await initializeDatabase();
        console.log('Restoring admin user...');
        const result = await dbRun(`UPDATE users SET is_active = 1 WHERE username = 'admin'`);
        console.log('Admin user restored.');
        await closeDatabase();
        process.exit(0);
    } catch (error) {
        console.error('Error restoring admin:', error);
        await closeDatabase();
        process.exit(1);
    }
}

restoreAdmin();

import 'dotenv/config';
import { initializeDatabase, dbAll, closeDatabase } from '../src/database';

async function checkUsers() {
    try {
        await initializeDatabase();
        const users = await dbAll(`SELECT id, username, role, is_active FROM users`);
        console.log(JSON.stringify(users, null, 2));
        await closeDatabase();
        process.exit(0);
    } catch (error) {
        console.error('Error checking users:', error);
        await closeDatabase();
        process.exit(1);
    }
}

checkUsers();

import 'dotenv/config';
import { initializeDatabase, dbGet, closeDatabase } from './src/database/index.js';

async function checkInfoPage() {
    try {
        console.log('Connecting to database...');
        await initializeDatabase();
        
        console.log('Querying settings table for agent_info_page...');
        const result = await dbGet("SELECT [value] FROM settings WHERE [key] = 'agent_info_page'");
        
        if (result && result.value) {
            console.log('Found Info Page data in SQL:');
            console.log('---------------------------');
            try {
                const parsed = JSON.parse(result.value);
                console.log(JSON.stringify(parsed, null, 2));
            } catch (e) {
                console.log('RAW content (not JSON):', result.value);
            }
            console.log('---------------------------');
        } else {
            console.log('!!! WARNING: agent_info_page is EMPTY or MISSING in the database.');
        }
    } catch (err: any) {
        console.error('Database query failed:', err.message);
    } finally {
        await closeDatabase();
        process.exit();
    }
}

checkInfoPage();

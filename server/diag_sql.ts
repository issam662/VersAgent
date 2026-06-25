import { dbRun, dbGet } from './src/database/index.js';

async function test() {
    try {
        const id = '3d62f393-55d2-4b9d-a9a9-456caef92e02';
        console.log("Testing UPDATE machines...");
        await dbRun('UPDATE machines SET os_name = ?, os_version = ?, os_build = ?, current_user = ?, last_inventory = GETUTCDATE() WHERE id = ?',
            ['Windows 11', '10.0', '22631', 'APTIV\\ahhpks', id]);
        console.log("UPDATE successful.");
    } catch (e: any) {
        console.error("SQL Error:", e.message);
    }
}
test();

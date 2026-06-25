import bcrypt from 'bcryptjs';
import { initializeDatabase, dbRun, closeDatabase } from './index.js';

async function updatePassword() {
    console.log('Updating admin password...');
    await initializeDatabase();

    const newPassword = 'Delphi20232024--';
    const passwordHash = await bcrypt.hash(newPassword, 12);

    await dbRun('UPDATE users SET password_hash = ? WHERE username = ?', [passwordHash, 'admin']);

    console.log('✓ Password updated successfully!');
    console.log('New credentials: admin / Delphi20232024--');

    closeDatabase();
}

updatePassword().catch(console.error);

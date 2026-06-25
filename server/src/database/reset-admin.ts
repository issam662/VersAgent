import bcrypt from 'bcryptjs';
import { initializeDatabase, closeDatabase, dbRun, dbGet } from './index.js';

async function resetAdmin() {
    console.log('Resetting admin account...');

    await initializeDatabase();

    // Check if admin exists
    const admin = await dbGet('SELECT * FROM users WHERE username = ?', ['admin']) as any;

    if (!admin) {
        console.log('❌ No admin user found!');
        closeDatabase();
        return;
    }

    console.log('Found admin user:', { id: admin.id, is_active: admin.is_active, locked_until: admin.locked_until });

    // Reset password to 'admin123'
    const newPasswordHash = await bcrypt.hash('admin123', 12);

    await dbRun(
        'UPDATE users SET password_hash = ?, is_active = 1, failed_login_attempts = 0, locked_until = NULL WHERE username = ?',
        [newPasswordHash, 'admin']
    );

    console.log('✓ Admin password reset to: admin123');
    console.log('✓ Admin account enabled');
    console.log('✓ Account unlocked');

    closeDatabase();
}

resetAdmin().catch(console.error);

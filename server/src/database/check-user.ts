import { initializeDatabase, dbGet, dbRun, closeDatabase } from './index.js';

async function checkUser() {
    console.log('Checking admin user...');
    await initializeDatabase();

    const user = await dbGet('SELECT id, username, role, is_active, locked_until, failed_login_attempts FROM users WHERE username = ?', ['admin']);

    console.log('User record:', user);

    if (!user) {
        console.log('User not found! Creating admin user...');
        const bcrypt = await import('bcryptjs');
        const { v4: uuidv4 } = await import('uuid');
        const passwordHash = await bcrypt.hash('admin123', 12);
        await dbRun(
            `INSERT INTO users (id, username, password_hash, role, email, is_active) VALUES (?, 'admin', ?, 'SuperAdmin', 'admin@aptiv.local', 1)`,
            [uuidv4(), passwordHash]
        );
        console.log('Created admin user successfully!');
    } else if (!user.is_active) {
        console.log('User is inactive, activating...');
        await dbRun('UPDATE users SET is_active = 1 WHERE username = ?', ['admin']);
        console.log('User activated!');
    } else if (user.locked_until) {
        console.log('User is locked, unlocking...');
        await dbRun('UPDATE users SET locked_until = NULL, failed_login_attempts = 0 WHERE username = ?', ['admin']);
        console.log('User unlocked!');
    } else {
        console.log('User looks good!');
    }

    closeDatabase();
}

checkUser().catch(console.error);

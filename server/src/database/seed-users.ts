import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import { initializeDatabase, closeDatabase, dbRun, dbGet } from './index.js';

async function seedUsers() {
    console.log('Starting user seed...');

    await initializeDatabase();

    const defaultPassword = await bcrypt.hash('Aptiv2026!', 12);

    const users = [
        {
            username: 'ahhpks',
            fullName: 'Hamzaoui, Issam',
            title: 'IT Technician',
            role: 'SuperAdmin',
            email: 'issam.hamzaoui@aptiv.com'
        },
        {
            username: 'fwsi3l',
            fullName: 'Belhalloumi, Abdelkhalk',
            title: 'IT Technician',
            role: 'Admin',
            email: 'abdelkhalk.belhalloumi@aptiv.com'
        },
        {
            username: 'fwnhl3',
            fullName: 'Ali Belgharbi',
            title: 'IT Technician',
            role: 'Admin',
            email: 'ali.belgharbi@aptiv.com'
        },
        {
            username: 'wjcq33',
            fullName: 'Saadi, Fouad',
            title: 'IT Engineer',
            role: 'Admin',
            email: 'fouad.saadi@aptiv.com'
        }
    ];

    for (const user of users) {
        const existing = await dbGet('SELECT id FROM users WHERE username = ?', [user.username]);

        if (!existing) {
            const id = uuidv4();
            await dbRun(
                `INSERT INTO users (id, username, password_hash, full_name, title, role, email, is_active) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
                [id, user.username, defaultPassword, user.fullName, user.title, user.role, user.email]
            );
            console.log(`✓ Created user: ${user.username} (${user.fullName}) - ${user.role}`);
        } else {
            // Update existing user with full_name and title
            await dbRun(
                `UPDATE users SET full_name = ?, title = ?, role = ? WHERE username = ?`,
                [user.fullName, user.title, user.role, user.username]
            );
            console.log(`✓ Updated user: ${user.username} (${user.fullName}) - ${user.role}`);
        }
    }

    // Demote the old 'admin' account to Admin if it exists and isn't one of our users
    const oldAdmin = await dbGet('SELECT id, username FROM users WHERE username = ? AND role = ?', ['admin', 'SuperAdmin']);
    if (oldAdmin) {
        await dbRun(`UPDATE users SET role = 'Admin' WHERE username = 'admin'`);
        console.log('✓ Demoted old admin account to Admin role');
    }

    console.log('\n✅ User seed completed!');
    console.log('Default password for all accounts: Aptiv2026!');

    await closeDatabase();
}

seedUsers().catch(console.error);

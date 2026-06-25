import { initializeDatabase, dbGet } from './dist/database/index.js';
import { notificationService } from './dist/services/notificationService.js';
import { config } from 'dotenv';

config();

// Override for port 465 test
process.env.SMTP_PORT = '465';
process.env.SMTP_SECURE = 'true';

async function run() {
    try {
        console.log('Initializing database...');
        await initializeDatabase();

        console.log('Finding user ahhpks...');
        const result = await dbGet("SELECT TOP 1 * FROM users WHERE username = 'ahhpks'");
        const user = result;
        
        if (!user) {
            console.error('User not found!');
            process.exit(1);
        }

        console.log(`Sending test notification to ${user.username} (${user.email})...`);
        console.log(`Email Notifications Enabled: ${user.email_notifications}`);

        await notificationService.sendNotification({
            userId: user.id,
            type: 'system_alert',
            severity: 'info',
            title: 'Test Email Notification',
            message: 'This is a test notification to verify that the email service is working perfectly after fixing the compiler bug!',
            link: '/dashboard'
        });

        console.log('Notification dispatched via notificationService!');

        // Also test direct email to be 100% sure
        const { sendEmail } = await import('./dist/services/emailService.js');
        console.log('Sending direct test email...');
        await sendEmail(user.email, 'Direct SMTP Test', '<p>This is a direct SMTP test to bypass any DB condition checks.</p>');
        console.log('Direct email sent!');
        
        // Wait 5 seconds to let nodemailer finish
        setTimeout(() => {
            console.log('Test completed successfully.');
            process.exit(0);
        }, 5000);

    } catch (error) {
        console.error('Error during test:', error);
        process.exit(1);
    }
}

run();

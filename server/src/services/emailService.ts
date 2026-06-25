import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.example.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
    auth: process.env.SMTP_USER ? {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    } : undefined,
});

export const sendEmail = async (to: string, subject: string, html: string) => {
    // If SMTP is not configured, just log it. 
    if (!process.env.SMTP_HOST || process.env.SMTP_HOST.includes('example.com') || process.env.SMTP_HOST === 'YOUR_SMTP_HOST') {
        console.warn(`[Email Service] SMTP not configured. Would have sent email to ${to} with subject: ${subject}`);
        return;
    }

    try {
        const info = await transporter.sendMail({
            from: process.env.SMTP_FROM || '"PC Inventory System" <noreply@aptiv.com>',
            to,
            subject,
            html,
        });
        console.log(`[Email Service] Message sent: ${info.messageId}`);
    } catch (error) {
        console.error('[Email Service] Failed to send email:', error);
    }
};

/**
 * Email Notification Transport
 *
 * Sends email alerts for critical notifications using nodemailer.
 *
 * Required env vars (all optional - email disabled if not set):
 * - SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
 * - NOTIFICATION_EMAIL (recipient)
 */

import nodemailer from 'nodemailer';

interface EmailOptions {
    type: string;
    severity: string;
    title: string;
    message: string;
}

function escapeHtml(unsafe: string): string {
    return unsafe
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function getTransporter() {
    const host = process.env.SMTP_HOST;
    const parsedPort = parseInt(process.env.SMTP_PORT || '587', 10);
    const port = Number.isFinite(parsedPort) ? parsedPort : 587;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    if (!host || !user || !pass) return null;

    return nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
    });
}

/**
 * Send a notification email. No-ops if SMTP is not configured.
 */
export async function sendNotificationEmail(options: EmailOptions): Promise<boolean> {
    const transporter = getTransporter();
    const recipient = process.env.NOTIFICATION_EMAIL;
    if (!transporter || !recipient) return false;

    const severityIcon = options.severity === 'critical' ? '[CRITICAL]'
        : options.severity === 'warning' ? '[WARNING]' : '[INFO]';

    const safeTitle = escapeHtml(options.title);
    const safeMessage = escapeHtml(options.message);
    const safeType = escapeHtml(options.type);
    const safeSeverity = escapeHtml(options.severity);

    try {
        await transporter.sendMail({
            from: process.env.SMTP_USER,
            to: recipient,
            subject: `${severityIcon} Domain Empire: ${options.title}`,
            html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #1a1a1a;">${safeTitle}</h2>
                    <p style="color: #4a4a4a; font-size: 16px;">${safeMessage}</p>
                    <hr style="border: 1px solid #eee;">
                    <p style="color: #888; font-size: 12px;">
                        Type: ${safeType} | Severity: ${safeSeverity}
                    </p>
                </div>
            `,
            text: `${options.title}\n\n${options.message}\n\nType: ${options.type} | Severity: ${options.severity}`,
        });
        return true;
    } catch (error) {
        console.error('Failed to send email:', error);
        return false;
    }
}

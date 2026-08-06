import nodemailer from "nodemailer";
import { emailEnabled, env } from "../config/env";

const transport = emailEnabled
  ? nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      // 465 is implicit TLS; every other common port (587, 25) starts
      // plaintext and upgrades via STARTTLS.
      secure: env.SMTP_PORT === 465,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    })
  : null;

/**
 * Sends the password-reset email, or — when no SMTP provider is configured —
 * logs the reset link to the console. This keeps the flow fully testable in
 * development without requiring a mail account, the same graceful-degradation
 * pattern used for the AI assistant.
 */
export const sendPasswordResetEmail = async (to: string, name: string, resetUrl: string) => {
  if (!transport) {
    console.log(
      `\n[mailer] SMTP not configured — would have emailed ${to}:\n  Reset link: ${resetUrl}\n`,
    );
    return;
  }

  await transport.sendMail({
    from: env.EMAIL_FROM,
    to,
    subject: "Reset your Church Management System password",
    text: `Hi ${name},\n\nSomeone asked to reset the password for this account. If that was you, set a new password here:\n\n${resetUrl}\n\nThis link expires in 1 hour. If you didn't request this, you can ignore this email — your password won't change.\n`,
    html: `
      <p>Hi ${name},</p>
      <p>Someone asked to reset the password for this account. If that was you, set a new password here:</p>
      <p><a href="${resetUrl}">${resetUrl}</a></p>
      <p>This link expires in 1 hour. If you didn't request this, you can ignore this email — your password won't change.</p>
    `.trim(),
  });
};

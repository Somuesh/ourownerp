import "dotenv/config";
import nodemailer from "nodemailer";

let transporter: ReturnType<typeof nodemailer.createTransport> | null = null;

export function isEmailConfigured(): boolean {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD);
}

/** Lazily creates (and reuses) a single SMTP transporter for the process.
 * Works with any SMTP provider — Gmail, SendGrid, Mailgun, SES, a local
 * dev tool like Mailhog/Mailpit — so this app isn't locked into one email
 * vendor's API. */
export function getTransporter() {
  if (!isEmailConfigured()) {
    throw new Error(
      "Email isn't configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, and SMTP_FROM in .env.",
    );
  }
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 465),
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
      tls: {
      rejectUnauthorized: true
      },
      connectionTimeout: 10000, // 10 seconds timeout to prevent hanging
      socketTimeout: 10000
    });
  }
  return transporter;
}

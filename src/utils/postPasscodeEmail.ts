import nodemailer from 'nodemailer';

interface SendPostPasscodeEmailParams {
  email: string;
  passcode: string;
  expiresInMinutes: number;
}

function getSmtpConfig(): {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
} {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = process.env.SMTP_SECURE === 'true';
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM;

  if (!host || !user || !pass || !from) {
    throw new Error(
      'SMTP configuration is missing. Please set SMTP_* env vars.'
    );
  }

  return { host, port, secure, user, pass, from };
}

// Singleton pooled transporter — reuses SMTP connection across calls
let _transporter: nodemailer.Transporter | null = null;

export function getTransporter(): nodemailer.Transporter {
  if (!_transporter) {
    const cfg = getSmtpConfig();
    _transporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: { user: cfg.user, pass: cfg.pass },
      pool: true,
      maxConnections: 5,
    });
  }
  return _transporter;
}

export async function sendPostPasscodeEmail({
  email,
  passcode,
  expiresInMinutes,
}: SendPostPasscodeEmailParams): Promise<void> {
  const cfg = getSmtpConfig();
  const transporter = getTransporter();

  await transporter.sendMail({
    from: cfg.from,
    to: email,
    subject: 'FoodShare - Ma passcode tao bai dang',
    text: `Ma passcode cua ban la ${passcode}. Ma co hieu luc trong ${expiresInMinutes} phut.`,
    html: `<p>Ma passcode cua ban la <strong>${passcode}</strong>.</p><p>Ma co hieu luc trong <strong>${expiresInMinutes} phut</strong>.</p>`,
  });
}

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
    throw new Error('SMTP configuration is missing. Please set SMTP_* env vars.');
  }

  return {
    host,
    port,
    secure,
    user,
    pass,
    from,
  };
}

export async function sendPostPasscodeEmail({
  email,
  passcode,
  expiresInMinutes,
}: SendPostPasscodeEmailParams): Promise<void> {
  const smtpConfig = getSmtpConfig();

  const transporter = nodemailer.createTransport({
    host: smtpConfig.host,
    port: smtpConfig.port,
    secure: smtpConfig.secure,
    auth: {
      user: smtpConfig.user,
      pass: smtpConfig.pass,
    },
  });

  await transporter.sendMail({
    from: smtpConfig.from,
    to: email,
    subject: 'FoodShare - Ma passcode tao bai dang',
    text: `Ma passcode cua ban la ${passcode}. Ma co hieu luc trong ${expiresInMinutes} phut.`,
    html: `<p>Ma passcode cua ban la <strong>${passcode}</strong>.</p><p>Ma co hieu luc trong <strong>${expiresInMinutes} phut</strong>.</p>`,
  });
}

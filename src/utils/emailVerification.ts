import nodemailer from 'nodemailer';

interface SendVerificationEmailParams {
  email: string;
  code: string;
  expiresInMinutes: number;
}

function getSmtpConfig() {
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

export async function sendVerificationEmail({
  email,
  code,
  expiresInMinutes,
}: SendVerificationEmailParams): Promise<void> {
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
    subject: 'FoodShare - Xac minh dia chi email',
    text: `Ma xac minh cua ban la ${code}. Ma co hieu luc trong ${expiresInMinutes} phut. Khong chia se ma nay voi bat ky ai.`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #296C24; margin-bottom: 16px;">FoodShare - Xac minh email</h2>
        <p>Ma xac minh cua ban la:</p>
        <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #296C24; background: #F0F9F0; padding: 16px; border-radius: 8px; text-align: center; margin: 16px 0;">
          ${code}
        </div>
        <p>Ma co hieu luc trong <strong>${expiresInMinutes} phut</strong>.</p>
        <p style="color: #888; font-size: 12px;">Khong chia se ma nay voi bat ky ai.</p>
      </div>
    `,
  });
}

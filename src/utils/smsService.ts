import twilio from 'twilio';

interface SendSmsParams {
  to: string;
  body: string;
}

function getTwilioConfig(): {
  accountSid: string;
  authToken: string;
  fromNumber: string;
} {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    throw new Error(
      'Twilio configuration is missing. Please set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER env vars.'
    );
  }

  return { accountSid, authToken, fromNumber };
}

export async function sendSms({ to, body }: SendSmsParams): Promise<void> {
  const config = getTwilioConfig();

  const client = twilio(config.accountSid, config.authToken);

  await client.messages.create({
    body,
    from: config.fromNumber,
    to,
  });
}

export async function sendPostPasscodeSms({
  phoneNumber,
  passcode,
  expiresInMinutes,
}: {
  phoneNumber: string;
  passcode: string;
  expiresInMinutes: number;
}): Promise<void> {
  const body = `[FoodShare] Ma xac thuc tao bai dang cua ban la: ${passcode}. Ma het han sau ${expiresInMinutes} phut. Khong chia se ma nay voi bat ky ai.`;

  await sendSms({ to: phoneNumber, body });
}

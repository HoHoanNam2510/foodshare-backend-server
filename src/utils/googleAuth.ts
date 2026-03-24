import { OAuth2Client, TokenPayload } from 'google-auth-library';

export interface GoogleUserPayload {
  googleId: string;
  email: string;
  fullName: string;
  avatar?: string;
}

const googleClient = new OAuth2Client();

function getGoogleClientIds(): string[] {
  const rawClientIds =
    process.env.GOOGLE_CLIENT_IDS || process.env.GOOGLE_CLIENT_ID || '';

  const clientIds = rawClientIds
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (clientIds.length === 0) {
    throw new Error('Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_IDS in environment');
  }

  return clientIds;
}

function mapGooglePayload(payload: TokenPayload): GoogleUserPayload {
  const email = payload.email;
  const fullName = payload.name;
  const googleId = payload.sub;

  if (!email || !fullName || !googleId) {
    throw new Error('Google token payload is missing required fields');
  }

  if (payload.email_verified === false) {
    throw new Error('Google account email is not verified');
  }

  return {
    googleId,
    email: email.toLowerCase(),
    fullName,
    avatar: payload.picture,
  };
}

export async function verifyGoogleIdToken(
  idToken: string
): Promise<GoogleUserPayload> {
  const audience = getGoogleClientIds();

  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience,
  });

  const payload = ticket.getPayload();

  if (!payload) {
    throw new Error('Invalid Google token');
  }

  return mapGooglePayload(payload);
}

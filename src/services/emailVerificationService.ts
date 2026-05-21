import User from '@/models/User';
import EmailVerificationCode from '@/models/EmailVerificationCode';
import { sendVerificationEmail } from '@/utils/emailVerification';

const CODE_LENGTH = 6;
const CODE_EXPIRE_MINUTES = 10;
const MAX_SEND_PER_MINUTE = 3;

function generateNumericCode(length: number): string {
  let code = '';
  for (let i = 0; i < length; i += 1) {
    code += Math.floor(Math.random() * 10).toString();
  }
  return code;
}

export class EmailVerificationError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly errorCode?: string
  ) {
    super(message);
    this.name = 'EmailVerificationError';
  }
}

export async function initiateEmailVerification(
  userId: string
): Promise<{ expiresInMinutes: number }> {
  const user = await User.findById(userId).select(
    'email authProvider isEmailVerified'
  );

  if (!user) {
    throw new EmailVerificationError('Không tìm thấy người dùng', 404);
  }

  if (user.isEmailVerified) {
    throw new EmailVerificationError(
      'Email đã được xác minh trước đó',
      400,
      'ALREADY_VERIFIED'
    );
  }

  const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
  const recentCount = await EmailVerificationCode.countDocuments({
    userId,
    createdAt: { $gte: oneMinuteAgo },
  });

  if (recentCount >= MAX_SEND_PER_MINUTE) {
    throw new EmailVerificationError(
      'Bạn đã gửi mã quá nhiều lần. Vui lòng thử lại sau khoảng 1 phút',
      429
    );
  }

  const code = generateNumericCode(CODE_LENGTH);
  const expiresAt = new Date(Date.now() + CODE_EXPIRE_MINUTES * 60 * 1000);

  await EmailVerificationCode.updateMany(
    { userId, usedAt: null },
    { $set: { usedAt: new Date() } }
  );

  const codeDoc = await EmailVerificationCode.create({
    userId,
    code,
    expiresAt,
  });

  try {
    await sendVerificationEmail({
      email: user.email,
      code,
      expiresInMinutes: CODE_EXPIRE_MINUTES,
    });
  } catch (sendError) {
    await EmailVerificationCode.findByIdAndDelete(codeDoc._id);
    throw sendError;
  }

  return { expiresInMinutes: CODE_EXPIRE_MINUTES };
}

export async function confirmEmailVerification(
  userId: string,
  code: string
): Promise<void> {
  if (
    typeof code !== 'string' ||
    !new RegExp(`^\\d{${CODE_LENGTH}}$`).test(code)
  ) {
    throw new EmailVerificationError(
      `Mã xác minh phải gồm đúng ${CODE_LENGTH} chữ số`,
      400
    );
  }

  const user = await User.findById(userId).select('isEmailVerified');

  if (!user) {
    throw new EmailVerificationError('Không tìm thấy người dùng', 404);
  }

  if (user.isEmailVerified) {
    throw new EmailVerificationError(
      'Email đã được xác minh trước đó',
      400,
      'ALREADY_VERIFIED'
    );
  }

  const now = new Date();
  const codeRecord = await EmailVerificationCode.findOne({
    userId,
    code,
    usedAt: null,
    expiresAt: { $gt: now },
  }).sort({ createdAt: -1 });

  if (!codeRecord) {
    throw new EmailVerificationError(
      'Mã xác minh không hợp lệ hoặc đã hết hạn',
      400
    );
  }

  codeRecord.usedAt = now;
  await codeRecord.save();

  user.isEmailVerified = true;
  await user.save();
}

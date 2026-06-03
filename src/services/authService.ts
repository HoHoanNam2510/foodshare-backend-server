import { randomInt } from 'crypto';
import User from '@/models/User';
import PendingRegistration from '@/models/PendingRegistration';
import PasswordResetToken from '@/models/PasswordResetToken';
import { hashPassword, comparePassword, generateToken } from '@/utils/auth';
import { verifyGoogleIdToken } from '@/utils/googleAuth';
import {
  sendVerificationEmail,
  sendPasswordResetEmail,
} from '@/utils/emailVerification';
import { deleteImageByUrl } from '@/services/uploadService';

const CODE_LENGTH = 6;
const CODE_EXPIRE_MINUTES = 10;
const MAX_SEND_PER_MINUTE = 3;

export class AuthServiceError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly errorCode?: string
  ) {
    super(message);
    this.name = 'AuthServiceError';
  }
}

function generateNumericCode(length: number): string {
  let code = '';
  for (let i = 0; i < length; i += 1) {
    code += randomInt(0, 10).toString();
  }
  return code;
}

function hasRequiredProfileInfo(user: {
  phoneNumber?: string;
  defaultAddress?: string;
}): boolean {
  return (
    Boolean(user.phoneNumber?.trim()) && Boolean(user.defaultAddress?.trim())
  );
}

export function sanitizeUser<
  TUser extends { toObject: () => Record<string, unknown> },
>(user: TUser): Record<string, unknown> {
  const userData = user.toObject();
  delete userData.password;
  return userData;
}

// =============================================
// REGISTRATION
// =============================================

export async function initiateRegistration(params: {
  email: string;
  password: string;
  fullName: string;
  phoneNumber?: string;
}): Promise<{ expiresInMinutes: number }> {
  const { email, password, fullName, phoneNumber } = params;
  const normalizedEmail = email.toLowerCase();

  const existingUser = await User.findOne({
    $or: [
      { email: normalizedEmail },
      ...(phoneNumber ? [{ phoneNumber }] : []),
    ],
  });

  if (existingUser) {
    if (existingUser.email === normalizedEmail) {
      if (existingUser.authProvider === 'GOOGLE') {
        throw new AuthServiceError(
          'Email này đã được đăng ký bằng Google. Vui lòng đăng nhập bằng Google.',
          409
        );
      }
      throw new AuthServiceError(
        'Email này đã được đăng ký. Vui lòng đăng nhập.',
        409
      );
    }
    throw new AuthServiceError('Số điện thoại đã được sử dụng', 409);
  }

  const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
  const recentCount = await PendingRegistration.countDocuments({
    email: normalizedEmail,
    createdAt: { $gte: oneMinuteAgo },
  });

  if (recentCount >= MAX_SEND_PER_MINUTE) {
    throw new AuthServiceError(
      'Bạn đã gửi mã quá nhiều lần. Vui lòng thử lại sau khoảng 1 phút',
      429
    );
  }

  const hashedPassword = await hashPassword(password);
  const code = generateNumericCode(CODE_LENGTH);
  const expiresAt = new Date(Date.now() + CODE_EXPIRE_MINUTES * 60 * 1000);

  await PendingRegistration.deleteMany({ email: normalizedEmail });

  const pending = await PendingRegistration.create({
    email: normalizedEmail,
    fullName,
    phoneNumber: phoneNumber || '',
    hashedPassword,
    code,
    expiresAt,
  });

  try {
    await sendVerificationEmail({
      email: normalizedEmail,
      code,
      expiresInMinutes: CODE_EXPIRE_MINUTES,
    });
  } catch (sendError) {
    await PendingRegistration.findByIdAndDelete(pending._id);
    throw sendError;
  }

  return { expiresInMinutes: CODE_EXPIRE_MINUTES };
}

export async function verifyRegistrationCode(
  email: string,
  code: string
): Promise<boolean> {
  const normalizedEmail = email.toLowerCase();
  const pending = await PendingRegistration.findOne({
    email: normalizedEmail,
    code,
    expiresAt: { $gt: new Date() },
  });
  return Boolean(pending);
}

export async function completeRegistration(params: {
  email: string;
  code: string;
}): Promise<{
  token: string;
  user: Record<string, unknown>;
  onboardingRequired: boolean;
}> {
  const normalizedEmail = params.email.toLowerCase();

  const pending = await PendingRegistration.findOne({
    email: normalizedEmail,
    code: params.code,
    expiresAt: { $gt: new Date() },
  });

  if (!pending) {
    throw new AuthServiceError('Mã xác minh không hợp lệ hoặc đã hết hạn', 400);
  }

  const existingUser = await User.findOne({ email: normalizedEmail });
  if (existingUser) {
    await PendingRegistration.deleteMany({ email: normalizedEmail });
    throw new AuthServiceError('Email đã được sử dụng', 409);
  }

  const isProfileCompleted = hasRequiredProfileInfo({
    phoneNumber: pending.phoneNumber,
    defaultAddress: '',
  });

  const newUser = await User.create({
    email: normalizedEmail,
    password: pending.hashedPassword,
    fullName: pending.fullName,
    phoneNumber: pending.phoneNumber || undefined,
    defaultAddress: '',
    authProvider: 'LOCAL',
    isEmailVerified: true,
    isProfileCompleted,
    role: 'USER',
  });

  await PendingRegistration.deleteMany({ email: normalizedEmail });

  const token = generateToken(newUser._id.toString(), newUser.role);

  return {
    token,
    user: sanitizeUser(newUser),
    onboardingRequired: !newUser.isProfileCompleted,
  };
}

// =============================================
// LOGIN
// =============================================

export async function loginWithPassword(params: {
  email: string;
  password: string;
}): Promise<{
  token: string;
  user: Record<string, unknown>;
  onboardingRequired: boolean;
}> {
  const user = await User.findOne({ email: params.email.toLowerCase() }).select(
    '+password'
  );

  if (!user) {
    throw new AuthServiceError('Tài khoản không tồn tại', 404);
  }

  if (user.status === 'BANNED') {
    throw new AuthServiceError('Tài khoản của bạn đã bị khóa', 403);
  }

  if (user.authProvider === 'GOOGLE' && !user.password) {
    throw new AuthServiceError(
      'Tài khoản này đăng ký bằng Google. Vui lòng đăng nhập bằng Google',
      400
    );
  }

  if (!user.password) {
    throw new AuthServiceError(
      'Tài khoản chưa có mật khẩu, vui lòng đăng nhập bằng Google',
      400
    );
  }

  const isMatch = await comparePassword(params.password, user.password);
  if (!isMatch) {
    throw new AuthServiceError('Mật khẩu không chính xác', 401);
  }

  const token = generateToken(user._id.toString(), user.role);
  return {
    token,
    user: sanitizeUser(user),
    onboardingRequired: !user.isProfileCompleted,
  };
}

export async function loginWithGoogle(idToken: string): Promise<{
  token: string;
  user: Record<string, unknown>;
  onboardingRequired: boolean;
}> {
  const googleUser = await verifyGoogleIdToken(idToken);

  let user = await User.findOne({
    $or: [{ googleId: googleUser.googleId }, { email: googleUser.email }],
  }).select('+password');

  if (!user) {
    user = await User.create({
      email: googleUser.email,
      googleId: googleUser.googleId,
      authProvider: 'GOOGLE',
      isEmailVerified: true,
      isProfileCompleted: false,
      fullName: googleUser.fullName,
      avatar: googleUser.avatar || '',
      role: 'USER',
    });
  } else {
    if (user.status === 'BANNED') {
      throw new AuthServiceError('Tài khoản của bạn đã bị khóa', 403);
    }

    let shouldSave = false;
    if (!user.googleId) {
      user.googleId = googleUser.googleId;
      shouldSave = true;
    }
    if (!user.avatar && googleUser.avatar) {
      user.avatar = googleUser.avatar;
      shouldSave = true;
    }
    if (!user.fullName && googleUser.fullName) {
      user.fullName = googleUser.fullName;
      shouldSave = true;
    }
    if (!user.isEmailVerified) {
      user.isEmailVerified = true;
      shouldSave = true;
    }

    const computedProfileCompleted = hasRequiredProfileInfo(user);
    if (user.isProfileCompleted !== computedProfileCompleted) {
      user.isProfileCompleted = computedProfileCompleted;
      shouldSave = true;
    }

    if (shouldSave) await user.save();
  }

  const token = generateToken(user._id.toString(), user.role);
  return {
    token,
    user: sanitizeUser(user),
    onboardingRequired: !user.isProfileCompleted,
  };
}

// =============================================
// PROFILE
// =============================================

export async function getUserById(
  userId: string
): Promise<Record<string, unknown> | null> {
  const user = await User.findById(userId);
  if (!user) return null;
  return sanitizeUser(user);
}

export async function finishProfile(params: {
  userId: string;
  phoneNumber: string;
  defaultAddress: string;
}): Promise<{ user: Record<string, unknown>; onboardingRequired: boolean }> {
  const { userId, phoneNumber, defaultAddress } = params;

  const duplicate = await User.findOne({ phoneNumber, _id: { $ne: userId } });
  if (duplicate) {
    throw new AuthServiceError('Số điện thoại đã được sử dụng', 409);
  }

  const isProfileCompleted = hasRequiredProfileInfo({
    phoneNumber,
    defaultAddress,
  });

  const user = await User.findByIdAndUpdate(
    userId,
    { $set: { phoneNumber, defaultAddress, isProfileCompleted } },
    { new: true }
  );

  if (!user) throw new AuthServiceError('Không tìm thấy người dùng', 404);

  return {
    user: sanitizeUser(user),
    onboardingRequired: !user.isProfileCompleted,
  };
}

export async function updateUserProfile(params: {
  userId: string;
  updates: {
    fullName?: string;
    phoneNumber?: string;
    defaultAddress?: string;
    avatar?: string;
    storeInfo?: unknown;
    paymentInfo?: unknown;
  };
}): Promise<Record<string, unknown>> {
  const { userId, updates } = params;

  if (updates.phoneNumber) {
    const duplicate = await User.findOne({
      phoneNumber: updates.phoneNumber,
      _id: { $ne: userId },
    });
    if (duplicate)
      throw new AuthServiceError('Số điện thoại đã được sử dụng', 409);
  }

  const currentUser = await User.findById(userId);
  if (!currentUser)
    throw new AuthServiceError('Không tìm thấy người dùng', 404);

  const updateData: Record<string, unknown> = {};
  if (updates.fullName !== undefined) updateData.fullName = updates.fullName;
  if (updates.phoneNumber !== undefined)
    updateData.phoneNumber = updates.phoneNumber;
  if (updates.defaultAddress !== undefined)
    updateData.defaultAddress = updates.defaultAddress;
  if (updates.avatar !== undefined) updateData.avatar = updates.avatar;
  if (updates.storeInfo !== undefined) updateData.storeInfo = updates.storeInfo;
  if (updates.paymentInfo !== undefined)
    updateData.paymentInfo = updates.paymentInfo;

  const mergedPhone =
    updates.phoneNumber !== undefined
      ? updates.phoneNumber
      : currentUser.phoneNumber;
  const mergedAddress =
    updates.defaultAddress !== undefined
      ? updates.defaultAddress
      : currentUser.defaultAddress;
  updateData.isProfileCompleted = hasRequiredProfileInfo({
    phoneNumber: mergedPhone,
    defaultAddress: mergedAddress,
  });

  if (
    updates.avatar !== undefined &&
    currentUser.avatar &&
    updates.avatar !== currentUser.avatar
  ) {
    deleteImageByUrl(currentUser.avatar).catch(() => {});
  }

  const user = await User.findByIdAndUpdate(
    userId,
    { $set: updateData },
    { new: true }
  );
  if (!user) throw new AuthServiceError('Không tìm thấy người dùng', 404);

  return sanitizeUser(user);
}

export async function updateUserLocation(params: {
  userId: string;
  longitude: number;
  latitude: number;
}): Promise<Record<string, unknown>> {
  const { userId, longitude, latitude } = params;

  const user = await User.findByIdAndUpdate(
    userId,
    {
      $set: { location: { type: 'Point', coordinates: [longitude, latitude] } },
    },
    { new: true }
  );

  if (!user) throw new AuthServiceError('Không tìm thấy người dùng', 404);
  return sanitizeUser(user);
}

// =============================================
// STORE REGISTRATION / KYC
// =============================================

export async function applyForStore(params: {
  userId: string;
  storeInfo: unknown;
  kycDocuments: unknown;
  paymentInfo?: unknown;
}): Promise<Record<string, unknown>> {
  const { userId, storeInfo, kycDocuments, paymentInfo } = params;

  const user = await User.findById(userId);
  if (!user) throw new AuthServiceError('Không tìm thấy người dùng', 404);

  if (user.role === 'STORE') {
    throw new AuthServiceError('Tài khoản của bạn đã là cửa hàng', 409);
  }
  if (user.role === 'ADMIN') {
    throw new AuthServiceError(
      'Tài khoản Admin không thể đăng ký cửa hàng',
      403
    );
  }
  if (!user.isProfileCompleted) {
    throw new AuthServiceError(
      'Vui lòng hoàn thiện hồ sơ cá nhân (số điện thoại, địa chỉ) trước khi đăng ký cửa hàng',
      400
    );
  }
  if (user.status === 'PENDING_KYC') {
    throw new AuthServiceError(
      'Bạn đã có đơn đăng ký cửa hàng đang chờ duyệt. Vui lòng chờ Admin xét duyệt.',
      409
    );
  }

  user.storeInfo = storeInfo as typeof user.storeInfo;
  user.kycDocuments = kycDocuments as typeof user.kycDocuments;
  if (paymentInfo) user.paymentInfo = paymentInfo as typeof user.paymentInfo;
  user.kycStatus = 'PENDING';
  user.status = 'PENDING_KYC';
  await user.save();

  return sanitizeUser(user);
}

export async function resubmitKycDocuments(params: {
  userId: string;
  kycDocuments: unknown;
}): Promise<Record<string, unknown>> {
  const { userId, kycDocuments } = params;

  const user = await User.findById(userId);
  if (!user) throw new AuthServiceError('Không tìm thấy người dùng', 404);

  if (user.role !== 'STORE') {
    throw new AuthServiceError(
      'Chỉ tài khoản cửa hàng mới có thể nộp lại KYC',
      403
    );
  }
  if (user.pendingKycStatus === 'PENDING') {
    throw new AuthServiceError(
      'Bạn đã có hồ sơ KYC đang chờ admin xét duyệt. Vui lòng chờ kết quả.',
      409
    );
  }

  user.pendingKycDocuments = kycDocuments as typeof user.pendingKycDocuments;
  user.pendingKycStatus = 'PENDING';
  user.kycGracePeriodEndsAt = null;
  await user.save();

  return sanitizeUser(user);
}

// =============================================
// PASSWORD
// =============================================

export async function setGooglePassword(params: {
  userId: string;
  newPassword: string;
}): Promise<Record<string, unknown>> {
  const { userId, newPassword } = params;

  const user = await User.findById(userId).select('+password');
  if (!user) throw new AuthServiceError('Không tìm thấy người dùng', 404);

  if (user.authProvider !== 'GOOGLE') {
    throw new AuthServiceError(
      'Chỉ tài khoản Google mới dùng endpoint này',
      400
    );
  }
  if (user.password) {
    throw new AuthServiceError('Tài khoản đã có mật khẩu', 409);
  }

  user.password = await hashPassword(newPassword);
  await user.save();

  return sanitizeUser(user);
}

export async function changeUserPassword(params: {
  userId: string;
  currentPassword: string;
  newPassword: string;
}): Promise<void> {
  const { userId, currentPassword, newPassword } = params;

  const user = await User.findById(userId).select('+password');
  if (!user) throw new AuthServiceError('Không tìm thấy người dùng', 404);

  if (!user.password) {
    throw new AuthServiceError(
      'Tài khoản này chưa có mật khẩu. Vui lòng dùng endpoint set-password',
      400
    );
  }

  const isMatch = await comparePassword(currentPassword, user.password);
  if (!isMatch) {
    throw new AuthServiceError(
      'Mật khẩu hiện tại không chính xác',
      401,
      'WRONG_CURRENT_PASSWORD'
    );
  }

  const isSame = await comparePassword(newPassword, user.password);
  if (isSame) {
    throw new AuthServiceError(
      'Mật khẩu mới không được trùng với mật khẩu hiện tại',
      400,
      'SAME_PASSWORD'
    );
  }

  user.password = await hashPassword(newPassword);
  await user.save();
}

// =============================================
// FORGOT PASSWORD
// =============================================

export async function initiateForgotPassword(
  email: string
): Promise<{ expiresInMinutes: number }> {
  const normalizedEmail = email.toLowerCase();

  const user = await User.findOne({ email: normalizedEmail });

  if (!user) {
    throw new AuthServiceError(
      'Email này chưa được đăng ký. Vui lòng tạo tài khoản mới.',
      404,
      'EMAIL_NOT_FOUND'
    );
  }

  if (user.authProvider === 'GOOGLE' && !user.password) {
    throw new AuthServiceError(
      'Tài khoản này đăng nhập bằng Google. Vui lòng đăng nhập bằng Google.',
      400,
      'GOOGLE_ACCOUNT'
    );
  }

  const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
  const recentCount = await PasswordResetToken.countDocuments({
    email: normalizedEmail,
    createdAt: { $gte: oneMinuteAgo },
  });

  if (recentCount >= MAX_SEND_PER_MINUTE) {
    throw new AuthServiceError(
      'Bạn đã gửi mã quá nhiều lần. Vui lòng thử lại sau khoảng 1 phút',
      429
    );
  }

  const code = generateNumericCode(CODE_LENGTH);
  const expiresAt = new Date(Date.now() + CODE_EXPIRE_MINUTES * 60 * 1000);

  await PasswordResetToken.deleteMany({ email: normalizedEmail });

  const resetToken = await PasswordResetToken.create({
    email: normalizedEmail,
    code,
    expiresAt,
  });

  try {
    await sendPasswordResetEmail({
      email: normalizedEmail,
      code,
      expiresInMinutes: CODE_EXPIRE_MINUTES,
    });
  } catch (sendError) {
    await PasswordResetToken.findByIdAndDelete(resetToken._id);
    throw sendError;
  }

  return { expiresInMinutes: CODE_EXPIRE_MINUTES };
}

export async function verifyForgotPasswordCode(
  email: string,
  code: string
): Promise<boolean> {
  const normalizedEmail = email.toLowerCase();
  const token = await PasswordResetToken.findOne({
    email: normalizedEmail,
    code,
    expiresAt: { $gt: new Date() },
  });
  return Boolean(token);
}

export async function resetPasswordWithCode(params: {
  email: string;
  code: string;
  newPassword: string;
}): Promise<void> {
  const normalizedEmail = params.email.toLowerCase();

  const token = await PasswordResetToken.findOne({
    email: normalizedEmail,
    code: params.code,
    expiresAt: { $gt: new Date() },
  });

  if (!token) {
    throw new AuthServiceError('Mã xác minh không hợp lệ hoặc đã hết hạn', 400);
  }

  const user = await User.findOne({ email: normalizedEmail }).select(
    '+password'
  );
  if (!user) throw new AuthServiceError('Tài khoản không tồn tại', 404);

  user.password = await hashPassword(params.newPassword);
  await user.save();

  await PasswordResetToken.deleteMany({ email: normalizedEmail });
}

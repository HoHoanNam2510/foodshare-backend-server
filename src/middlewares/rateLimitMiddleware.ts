import rateLimit from 'express-rate-limit';

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Quá nhiều yêu cầu, vui lòng thử lại sau 15 phút.',
    errorCode: 'RATE_LIMIT_EXCEEDED',
  },
});

export const otpLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Chỉ có thể gửi 3 mã OTP mỗi phút.',
    errorCode: 'OTP_RATE_LIMIT',
  },
});

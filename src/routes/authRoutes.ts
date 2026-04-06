import { Router } from 'express';
import {
  registerSendCode,
  registerVerify,
  login,
  googleLogin,
  completeProfile,
  setPassword,
  logout,
  getMe,
  updateProfile,
  registerStore,
} from '../controllers/authController';
import {
  sendEmailVerificationCode,
  verifyEmail,
} from '../controllers/emailVerificationController';
import { verifyAuth } from '../middlewares/authMiddleware';
import { validateBody } from '../middlewares/validateBodyMiddleware';
import {
  registerSchema,
  registerVerifySchema,
  loginSchema,
  googleLoginSchema,
  completeProfileSchema,
  setPasswordSchema,
  verifyEmailSchema,
  updateProfileSchema,
  registerStoreSchema,
} from '../validations/authValidation';

const router = Router();

// [POST] /api/auth/register/send-code  (Bước 1: validate + gửi mã)
router.post('/register/send-code', validateBody(registerSchema), registerSendCode);

// [POST] /api/auth/register/verify     (Bước 2: xác minh mã + tạo account)
router.post('/register/verify', validateBody(registerVerifySchema), registerVerify);

// [POST] /api/auth/login
router.post('/login', validateBody(loginSchema), login);

// [POST] /api/auth/google-login
router.post('/google-login', validateBody(googleLoginSchema), googleLogin);

// [PUT] /api/auth/complete-profile
router.put(
  '/complete-profile',
  verifyAuth,
  validateBody(completeProfileSchema),
  completeProfile
);

// [PUT] /api/auth/set-password
router.put(
  '/set-password',
  verifyAuth,
  validateBody(setPasswordSchema),
  setPassword
);

// [POST] /api/auth/email-verification/send
router.post('/email-verification/send', verifyAuth, sendEmailVerificationCode);

// [POST] /api/auth/email-verification/verify
router.post(
  '/email-verification/verify',
  verifyAuth,
  validateBody(verifyEmailSchema),
  verifyEmail
);

// [POST] /api/auth/register-store  (Đăng ký cửa hàng — nâng cấp USER → STORE)
router.post(
  '/register-store',
  verifyAuth,
  validateBody(registerStoreSchema),
  registerStore
);

// [POST] /api/auth/logout
router.post('/logout', verifyAuth, logout);

// [GET] /api/auth/me
router.get('/me', verifyAuth, getMe);

// [PUT] /api/auth/update-profile
router.put(
  '/update-profile',
  verifyAuth,
  validateBody(updateProfileSchema),
  updateProfile
);

export default router;

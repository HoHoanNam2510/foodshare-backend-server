import { Router } from 'express';
import {
  registerSendCode,
  registerVerify,
  verifyCodeOnly,
  login,
  googleLogin,
  completeProfile,
  setPassword,
  logout,
  getMe,
  updateProfile,
  updateMyLocation,
  registerStore,
  deleteMyAccount,
} from '../controllers/authController';
import {
  getMyTrash,
  restoreMyItem,
  purgeMyItem,
} from '../controllers/userTrashController';
import { validateParams } from '../middlewares/validateRequestMiddleware';
import { userTrashCollectionParamSchema } from '../validations/trashValidation';
import {
  sendEmailVerificationCode,
  verifyEmail,
} from '../controllers/emailVerificationController';
import { verifyAuth } from '../middlewares/authMiddleware';
import { validateBody } from '../middlewares/validateBodyMiddleware';
import {
  registerSchema,
  registerVerifySchema,
  verifyCodeOnlySchema,
  loginSchema,
  googleLoginSchema,
  completeProfileSchema,
  setPasswordSchema,
  verifyEmailSchema,
  updateProfileSchema,
  updateLocationSchema,
  registerStoreSchema,
} from '../validations/authValidation';

const router = Router();

// [POST] /api/auth/register/send-code  (Bước 1: validate + gửi mã)
router.post('/register/send-code', validateBody(registerSchema), registerSendCode);

// [POST] /api/auth/register/verify     (Bước 2: xác minh mã + tạo account)
router.post('/register/verify', validateBody(registerVerifySchema), registerVerify);

// [POST] /api/auth/register/verify-code  (Chỉ xác minh mã, không tạo account — dùng cho admin)
router.post('/register/verify-code', validateBody(verifyCodeOnlySchema), verifyCodeOnly);

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

// [PUT] /api/auth/me/location
router.put(
  '/me/location',
  verifyAuth,
  validateBody(updateLocationSchema),
  updateMyLocation
);

// [DELETE] /api/auth/me/account
// (User tự xóa tài khoản — soft delete + cascade Posts, Reviews, Conversations)
router.delete('/me/account', verifyAuth, deleteMyAccount);

// [GET] /api/auth/me/trash?collection=posts|reviews|vouchers&page=1&limit=20
router.get('/me/trash', verifyAuth, getMyTrash);

// [POST] /api/auth/me/trash/restore/:collection/:id
router.post(
  '/me/trash/restore/:collection/:id',
  verifyAuth,
  validateParams(userTrashCollectionParamSchema),
  restoreMyItem
);

// [DELETE] /api/auth/me/trash/purge/:collection/:id
router.delete(
  '/me/trash/purge/:collection/:id',
  verifyAuth,
  validateParams(userTrashCollectionParamSchema),
  purgeMyItem
);

export default router;

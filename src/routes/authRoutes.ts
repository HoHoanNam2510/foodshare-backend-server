import { Router } from 'express';
import {
  register,
  login,
  googleLogin,
  completeProfile,
  setPassword,
  logout,
  getMe,
  updateProfile,
} from '../controllers/authController';
import { verifyAuth } from '../middlewares/authMiddleware';
import { validateBody } from '../middlewares/validateBodyMiddleware';
import {
  registerSchema,
  loginSchema,
  googleLoginSchema,
  completeProfileSchema,
  setPasswordSchema,
  updateProfileSchema,
} from '../validations/authValidation';

const router = Router();

// [POST] /api/auth/register
router.post('/register', validateBody(registerSchema), register);

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

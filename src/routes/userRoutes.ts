import { Router } from 'express';

import {
  createUser,
  getUsers,
  getUserById,
  updateUser,
  deleteUser,
  reviewKyc,
} from '@/controllers/userController';
import { verifyAuth, verifyAdmin } from '../middlewares/authMiddleware';
import { validateBody } from '../middlewares/validateBodyMiddleware';
import {
  validateParams,
  validateQuery,
} from '../middlewares/validateRequestMiddleware';
import {
  createUserSchema,
  getUsersQuerySchema,
  userIdParamSchema,
  updateUserSchema,
  reviewKycSchema,
} from '../validations/userValidation';

const router = Router();

router.use(verifyAuth, verifyAdmin);

// [POST] /api/users
router.post('/', validateBody(createUserSchema), createUser);

// [GET] /api/users?search=&role=&status=&authProvider=&kycStatus=&isProfileCompleted=&page=&limit=&sortBy=&sortOrder=
router.get('/', validateQuery(getUsersQuerySchema), getUsers);

// [GET] /api/users/:id
router.get('/:id', validateParams(userIdParamSchema), getUserById);

// [PUT] /api/users/:id
router.put(
  '/:id',
  validateParams(userIdParamSchema),
  validateBody(updateUserSchema),
  updateUser
);

// [PATCH] /api/users/:id/kyc-review  (Admin duyệt/từ chối KYC)
router.patch(
  '/:id/kyc-review',
  validateParams(userIdParamSchema),
  validateBody(reviewKycSchema),
  reviewKyc
);

// [DELETE] /api/users/:id
router.delete('/:id', validateParams(userIdParamSchema), deleteUser);

export default router;

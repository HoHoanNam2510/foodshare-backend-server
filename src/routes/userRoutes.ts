import { Router } from 'express';

import {
  createUser,
  getUsers,
  getUserById,
  updateUser,
  deleteUser,
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

// [DELETE] /api/users/:id
router.delete('/:id', validateParams(userIdParamSchema), deleteUser);

export default router;

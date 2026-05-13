import { Router } from 'express';

import { verifyAuth, verifyAdmin } from '@/middlewares/authMiddleware';
import { validateBody } from '@/middlewares/validateBodyMiddleware';
import {
  getActiveCategoriesHandler,
  adminGetAllCategoriesHandler,
  adminCreateCategoryHandler,
  adminUpdateCategoryHandler,
  adminDeleteCategoryHandler,
} from '@/controllers/categoryController';
import {
  createCategorySchema,
  updateCategorySchema,
} from '@/validations/categoryValidation';

const router = Router();

// =============================================
// PUBLIC ROUTES
// =============================================

// GET /api/categories — Lấy danh sách category active (FilterPills)
// Query: applyTo? = 'P2P_FREE' | 'B2C_MYSTERY_BAG'
router.get('/', getActiveCategoriesHandler);

// =============================================
// ADMIN ROUTES
// Lưu ý: /admin phải đặt TRƯỚC /:categoryId để tránh conflict
// =============================================

// GET /api/categories/admin — Admin xem toàn bộ danh sách
router.get('/admin', verifyAuth, verifyAdmin, adminGetAllCategoriesHandler);

// POST /api/categories/admin — Admin tạo category mới
router.post(
  '/admin',
  verifyAuth,
  verifyAdmin,
  validateBody(createCategorySchema),
  adminCreateCategoryHandler
);

// PUT /api/categories/admin/:categoryId — Admin cập nhật category
router.put(
  '/admin/:categoryId',
  verifyAuth,
  verifyAdmin,
  validateBody(updateCategorySchema),
  adminUpdateCategoryHandler
);

// DELETE /api/categories/admin/:categoryId — Admin xóa mềm category
router.delete(
  '/admin/:categoryId',
  verifyAuth,
  verifyAdmin,
  adminDeleteCategoryHandler
);

export default router;

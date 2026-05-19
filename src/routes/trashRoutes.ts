import { Router } from 'express';

import {
  adminSoftDeleteUser,
  adminSoftDeletePost,
  adminSoftDeleteReview,
  adminSoftDeleteVoucher,
  adminSoftDeleteReport,
  getTrash,
  restoreFromTrash,
  purgeFromTrash,
  purgeAll,
  restoreUser,
  cleanupNow,
} from '@/controllers/trashController';
import { verifyAuth, verifyAdmin } from '@/middlewares/authMiddleware';
import { validateBody } from '@/middlewares/validateBodyMiddleware';
import { validateParams } from '@/middlewares/validateRequestMiddleware';
import {
  trashIdParamSchema,
  trashCollectionParamSchema,
  restoreUserBodySchema,
} from '@/validations/trashValidation';

const router = Router();

// Tất cả routes đều yêu cầu ADMIN
router.use(verifyAuth, verifyAdmin);

// =============================================
// SOFT DELETE (Admin override)
// =============================================

// [DELETE] /api/admin/trash/users/:id       — Admin soft delete user (cascade)
router.delete(
  '/users/:id',
  validateParams(trashIdParamSchema),
  adminSoftDeleteUser
);

// [DELETE] /api/admin/trash/posts/:id       — Admin soft delete post
router.delete(
  '/posts/:id',
  validateParams(trashIdParamSchema),
  adminSoftDeletePost
);

// [DELETE] /api/admin/trash/reviews/:id     — Admin soft delete review
router.delete(
  '/reviews/:id',
  validateParams(trashIdParamSchema),
  adminSoftDeleteReview
);

// [DELETE] /api/admin/trash/vouchers/:id    — Admin soft delete voucher
router.delete(
  '/vouchers/:id',
  validateParams(trashIdParamSchema),
  adminSoftDeleteVoucher
);

// [DELETE] /api/admin/trash/reports/:id     — Admin soft delete report
router.delete(
  '/reports/:id',
  validateParams(trashIdParamSchema),
  adminSoftDeleteReport
);

// =============================================
// THÙNG RÁC — Xem / Restore / Purge
// =============================================

// [GET]    /api/admin/trash                         — Xem thùng rác (filter by collection)
router.get('/', getTrash);

// [POST]   /api/admin/trash/restore/:collection/:id — Restore 1 item
router.post(
  '/restore/:collection/:id',
  validateParams(trashCollectionParamSchema),
  restoreFromTrash
);

// [DELETE] /api/admin/trash/purge/:collection/:id   — Xóa vĩnh viễn 1 item
router.delete(
  '/purge/:collection/:id',
  validateParams(trashCollectionParamSchema),
  purgeFromTrash
);

// [DELETE] /api/admin/trash/purge-all               — Xóa vĩnh viễn toàn bộ thùng rác
router.delete('/purge-all', purgeAll);

// [POST]   /api/admin/trash/restore-user/:id        — Restore user + cascade
router.post(
  '/restore-user/:id',
  validateParams(trashIdParamSchema),
  validateBody(restoreUserBodySchema),
  restoreUser
);

// [POST]   /api/admin/trash/cleanup-now             — Dọn dẹp ngay lập tức
router.post('/cleanup-now', cleanupNow);

export default router;

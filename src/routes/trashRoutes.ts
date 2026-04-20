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

const router = Router();

// Tất cả routes đều yêu cầu ADMIN
router.use(verifyAuth, verifyAdmin);

// =============================================
// SOFT DELETE (Admin override)
// =============================================

// [DELETE] /api/admin/trash/users/:id       — Admin soft delete user (cascade)
router.delete('/users/:id', adminSoftDeleteUser);

// [DELETE] /api/admin/trash/posts/:id       — Admin soft delete post
router.delete('/posts/:id', adminSoftDeletePost);

// [DELETE] /api/admin/trash/reviews/:id     — Admin soft delete review
router.delete('/reviews/:id', adminSoftDeleteReview);

// [DELETE] /api/admin/trash/vouchers/:id    — Admin soft delete voucher
router.delete('/vouchers/:id', adminSoftDeleteVoucher);

// [DELETE] /api/admin/trash/reports/:id     — Admin soft delete report
router.delete('/reports/:id', adminSoftDeleteReport);

// =============================================
// THÙNG RÁC — Xem / Restore / Purge
// =============================================

// [GET]    /api/admin/trash                         — Xem thùng rác (filter by collection)
router.get('/', getTrash);

// [POST]   /api/admin/trash/restore/:collection/:id — Restore 1 item
router.post('/restore/:collection/:id', restoreFromTrash);

// [DELETE] /api/admin/trash/purge/:collection/:id   — Xóa vĩnh viễn 1 item
router.delete('/purge/:collection/:id', purgeFromTrash);

// [DELETE] /api/admin/trash/purge-all               — Xóa vĩnh viễn toàn bộ thùng rác
router.delete('/purge-all', purgeAll);

// [POST]   /api/admin/trash/restore-user/:id        — Restore user + cascade
router.post('/restore-user/:id', restoreUser);

// [POST]   /api/admin/trash/cleanup-now             — Dọn dẹp ngay lập tức
router.post('/cleanup-now', cleanupNow);

export default router;

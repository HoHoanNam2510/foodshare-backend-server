import { Router } from 'express';

import { verifyAuth, verifyAdmin } from '@/middlewares/authMiddleware';
import {
  getBadgeCatalogHandler,
  getMyBadgesHandler,
  adminGetAllBadgesHandler,
  adminCreateBadgeHandler,
  adminUpdateBadgeHandler,
  adminToggleBadgeHandler,
  adminGetBadgeStatsHandler,
} from '@/controllers/badgeController';

const router = Router();

// =============================================
// USER ROUTES
// =============================================

// GET /api/badges/catalog — Xem catalog + trạng thái mở khóa cá nhân
router.get('/catalog', verifyAuth, getBadgeCatalogHandler);

// GET /api/badges/my — Xem huy hiệu đã mở khóa
router.get('/my', verifyAuth, getMyBadgesHandler);

// =============================================
// ADMIN ROUTES
// Lưu ý: /admin/stats phải đặt TRƯỚC /admin/:badgeId để tránh conflict
// =============================================

// GET /api/badges/admin/stats — Thống kê huy hiệu phổ biến nhất
router.get('/admin/stats', verifyAuth, verifyAdmin, adminGetBadgeStatsHandler);

// GET /api/badges/admin — Admin xem catalog + unlockedCount
router.get('/admin', verifyAuth, verifyAdmin, adminGetAllBadgesHandler);

// POST /api/badges/admin — Admin tạo huy hiệu mới
router.post('/admin', verifyAuth, verifyAdmin, adminCreateBadgeHandler);

// PUT /api/badges/admin/:badgeId — Admin cập nhật huy hiệu
router.put('/admin/:badgeId', verifyAuth, verifyAdmin, adminUpdateBadgeHandler);

// PATCH /api/badges/admin/:badgeId/toggle — Admin bật/tắt huy hiệu
router.patch('/admin/:badgeId/toggle', verifyAuth, verifyAdmin, adminToggleBadgeHandler);

export default router;

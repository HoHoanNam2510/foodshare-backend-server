import { Router } from 'express';
import {
  getPointHistory,
  adminGetAllPointLogs,
} from '@/controllers/greenPointController';
import { verifyAuth, verifyAdmin } from '@/middlewares/authMiddleware';

const router = Router();

// =============================================
// NHÓM USER (yêu cầu đăng nhập)
// =============================================

// [GET] /api/greenpoints/history
// (RWD_F01: Xem biến động số dư Green Points)
router.get('/history', verifyAuth, getPointHistory);

// =============================================
// NHÓM ADMIN
// =============================================

// [GET] /api/greenpoints/admin/logs
// (Admin xem toàn bộ lịch sử biến động điểm, có thể lọc theo userId)
router.get('/admin/logs', verifyAuth, verifyAdmin, adminGetAllPointLogs);

export default router;

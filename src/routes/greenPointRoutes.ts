import { Router } from 'express';
import {
  getPointHistory,
  adminGetAllPointLogs,
  getLeaderboard,
  getMyRankingSummary,
} from '@/controllers/greenPointController';
import {
  verifyAuth,
  verifyAdmin,
  optionalAuth,
} from '@/middlewares/authMiddleware';

const router = Router();

// =============================================
// NHÓM USER (yêu cầu đăng nhập)
// =============================================

// [GET] /api/greenpoints/history
// (RWD_F01: Xem biến động số dư Green Points)
router.get('/history', verifyAuth, getPointHistory);

// [GET] /api/greenpoints/leaderboard
// (RWD_F02: Xem bảng xếp hạng điểm xanh theo kỳ)
// Public route, optionalAuth để nếu có token sẽ trả thêm myRank
router.get('/leaderboard', optionalAuth, getLeaderboard);

// [GET] /api/greenpoints/ranking-summary
// (RWD_F03: Tóm tắt thứ hạng của tôi theo ngày/tuần/tháng/năm)
router.get('/ranking-summary', verifyAuth, getMyRankingSummary);

// =============================================
// NHÓM ADMIN
// =============================================

// [GET] /api/greenpoints/admin/logs
// (Admin xem toàn bộ lịch sử biến động điểm, có thể lọc theo userId)
router.get('/admin/logs', verifyAuth, verifyAdmin, adminGetAllPointLogs);

export default router;

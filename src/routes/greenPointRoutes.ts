import { Router } from 'express';
import { getPointHistory } from '@/controllers/greenPointController';
import { verifyAuth } from '@/middlewares/authMiddleware';

const router = Router();

// =============================================
// NHÓM USER (yêu cầu đăng nhập)
// =============================================

// [GET] /api/greenpoints/history
// (RWD_F01: Xem biến động số dư Green Points)
router.get('/history', verifyAuth, getPointHistory);

export default router;

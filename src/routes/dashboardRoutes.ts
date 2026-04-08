import { Router } from 'express';
import {
  dashboardStats,
  dashboardChart,
  dashboardTable,
} from '../controllers/dashboardController';
import { verifyAuth, verifyAdmin } from '../middlewares/authMiddleware';

const router = Router();

router.use(verifyAuth, verifyAdmin);

// [GET] /api/dashboard/stats    — tổng quan thống kê hệ thống
router.get('/stats', dashboardStats);

// [GET] /api/dashboard/chart    — dữ liệu biểu đồ tăng trưởng
router.get('/chart', dashboardChart);

// [GET] /api/dashboard/table    — dữ liệu bảng theo tab
router.get('/table', dashboardTable);

export default router;

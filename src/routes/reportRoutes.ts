import { Router } from 'express';
import {
  createReport,
  updateReport,
  withdrawReport,
  getMyReports,
  adminGetReports,
  adminGetReportDetail,
  adminProcessReport,
} from '../controllers/reportController';
import { verifyAuth, verifyAdmin } from '../middlewares/authMiddleware';
import { validateBody } from '../middlewares/validateBodyMiddleware';
import {
  createReportSchema,
  updateReportSchema,
  adminProcessReportSchema,
} from '../validations/reportValidation';

const router = Router();

// =============================================
// NHÓM ADMIN (yêu cầu đăng nhập + quyền Admin)
// Đặt trước các route user để tránh bị catch bởi param route
// =============================================

// [GET] /api/reports/admin
// (Danh sách báo cáo toàn hệ thống + lọc + phân trang)
router.get('/admin', verifyAuth, verifyAdmin, adminGetReports);

// [GET] /api/reports/admin/:id
// (Xem chi tiết bằng chứng 1 report cụ thể)
router.get('/admin/:id', verifyAuth, verifyAdmin, adminGetReportDetail);

// [PUT] /api/reports/admin/:id/process
// (Admin phán xử & thực thi hình phạt)
router.put(
  '/admin/:id/process',
  verifyAuth,
  verifyAdmin,
  validateBody(adminProcessReportSchema),
  adminProcessReport
);

// =============================================
// NHÓM USER / STORE (yêu cầu đăng nhập)
// =============================================

// [POST] /api/reports
// (Gửi báo cáo vi phạm)
router.post('/', verifyAuth, validateBody(createReportSchema), createReport);

// [GET] /api/reports/me
// (Xem lịch sử khiếu nại cá nhân)
router.get('/me', verifyAuth, getMyReports);

// [PUT] /api/reports/:id
// (Chỉnh sửa báo cáo — chỉ khi PENDING, chỉ reporter của mình)
router.put('/:id', verifyAuth, validateBody(updateReportSchema), updateReport);

// [DELETE] /api/reports/:id
// (Rút lại báo cáo — soft-delete sang WITHDRAWN, chỉ khi PENDING, chỉ reporter của mình)
router.delete('/:id', verifyAuth, withdrawReport);

export default router;

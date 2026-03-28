import { Router } from 'express';
import {
  createRequest,
  updateOrDeleteRequest,
  getPostTransactions,
  respondToRequest,
  scanQrAndComplete,
  processPayment,
  createOrder,
  getMyTransactions,
  cancelOrderByStore,
  adminGetTransactions,
  adminForceUpdateStatus,
} from '@/controllers/transactionController';
import { verifyAuth, verifyAdmin } from '@/middlewares/authMiddleware';

const router = Router();

// ===== NHÓM USER (Người Xin Đồ / Người Mua) =====

// [POST] /api/transactions/requests
// (TRX_F01: Người nhận tạo yêu cầu xin đồ)
router.post('/requests', verifyAuth, createRequest);

// [PUT] /api/transactions/requests/:id
// (TRX_F02, TRX_F03: Người nhận sửa hoặc xóa yêu cầu. Body truyền action: 'UPDATE' hoặc 'DELETE')
router.put('/requests/:id', verifyAuth, updateOrDeleteRequest);

// [GET] /api/transactions/me
// (Xem lịch sử giao dịch của tôi)
router.get('/me', verifyAuth, getMyTransactions);

// [POST] /api/transactions/orders
// (TRX_F07: Đặt mua túi mù B2C)
router.post('/orders', verifyAuth, createOrder);

// [POST] /api/transactions/orders/:id/pay
// (TRX_F08, TRX_F09, TRX_F10, TRX_F11: Mô phỏng thanh toán, kiểm tra hết hạn, tạo mã QR)
router.post('/orders/:id/pay', verifyAuth, processPayment);

// ===== NHÓM STORE / DONOR (Chủ Bài Đăng) =====

// [GET] /api/transactions/posts/:postId
// (TRX_F04: Xem danh sách giao dịch của 1 bài đăng — P2P: PENDING, B2C: ESCROWED)
router.get('/posts/:postId', verifyAuth, getPostTransactions);

// [PATCH] /api/transactions/:id/respond
// (TRX_F05, TRX_F06, TRX_F11: Người cho xác nhận/từ chối, cập nhật Post và sinh QR — CHỈ P2P)
router.patch('/:id/respond', verifyAuth, respondToRequest);

// [PATCH] /api/transactions/:id/cancel
// (Store hủy đơn B2C đã thanh toán và hoàn tiền)
router.patch('/:id/cancel', verifyAuth, cancelOrderByStore);

// [POST] /api/transactions/scan
// (TRX_F12, TRX_F13: Chủ cửa hàng quét mã QR để hoàn tất và nhận tiền)
router.post('/scan', verifyAuth, scanQrAndComplete);

// ===== NHÓM ADMIN =====

// [GET] /api/transactions/admin
// (ADM_T01: Admin xem toàn bộ giao dịch có filter và phân trang)
router.get('/admin', verifyAuth, verifyAdmin, adminGetTransactions);

// [PATCH] /api/transactions/admin/:id/status
// (ADM_T02: Admin ép đổi trạng thái giao dịch)
router.patch(
  '/admin/:id/status',
  verifyAuth,
  verifyAdmin,
  adminForceUpdateStatus
);

export default router;

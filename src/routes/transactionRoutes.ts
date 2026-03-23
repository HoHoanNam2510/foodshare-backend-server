import { Router } from 'express';
import {
  createRequest,
  updateOrDeleteRequest,
  getPostRequests,
  respondToRequest,
  scanQrAndComplete,
  processPayment,
  createOrder,
} from '../controllers/transactionController';
import { verifyAuth } from '../middlewares/authMiddleware';

const router = Router();

// [POST] /api/transactions/requests
// (TRX_F01: Người nhận tạo yêu cầu xin đồ)
router.post('/requests', verifyAuth, createRequest);

// [PUT] /api/transactions/requests/:id
// (TRX_F02, TRX_F03: Người nhận sửa hoặc xóa yêu cầu. Body truyền action: 'UPDATE' hoặc 'DELETE')
router.put('/requests/:id', verifyAuth, updateOrDeleteRequest);

// [GET] /api/transactions/posts/:postId/requests
// (TRX_F04: Người cho xem danh sách yêu cầu xin đồ của 1 bài đăng)
router.get('/posts/:postId/requests', verifyAuth, getPostRequests);

// [PATCH] /api/transactions/:id/respond
// (TRX_F05, TRX_F06: Người cho xác nhận/từ chối và tự động cập nhật Post)
router.patch('/:id/respond', verifyAuth, respondToRequest);

// [POST] /api/transactions/orders
// (TRX_F07: Thêm vào giỏ hàng và tạo đơn mua)
router.post('/orders', verifyAuth, createOrder);

// [POST] /api/transactions/orders/:id/pay
// (TRX_F08, TRX_F09, TRX_F10, TRX_F11: Mô phỏng thanh toán, kiểm tra hết hạn, tạo mã QR)
router.post('/orders/:id/pay', verifyAuth, processPayment);

// [POST] /api/transactions/scan
// (TRX_F12, TRX_F13: Chủ cửa hàng quét mã QR để hoàn tất và nhận tiền)
router.post('/scan', verifyAuth, scanQrAndComplete);

export default router;

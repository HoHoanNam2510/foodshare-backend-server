import { Router } from 'express';
import {
  createRequest,
  updateOrDeleteRequest,
  getPostTransactions,
  respondToRequest,
  scanQrAndComplete,
  createOrder,
  confirmReceiptByStore,
  getMyTransactions,
  getMyTransactionsAsOwner,
  getTransactionById,
  cancelOrderByStore,
  adminGetTransactions,
  adminForceUpdateStatus,
  devCompleteTransaction,
} from '@/controllers/transactionController';
import { verifyAuth, verifyAdmin } from '@/middlewares/authMiddleware';

const router = Router();

// ===== NHÓM USER (Người Xin Đồ / Người Mua) =====

// [POST] /api/transactions/requests
router.post('/requests', verifyAuth, createRequest);

// [PUT] /api/transactions/requests/:id
router.put('/requests/:id', verifyAuth, updateOrDeleteRequest);

// [GET] /api/transactions/me
router.get('/me', verifyAuth, getMyTransactions);

// [GET] /api/transactions/as-owner
router.get('/as-owner', verifyAuth, getMyTransactionsAsOwner);

// [POST] /api/transactions/orders
router.post('/orders', verifyAuth, createOrder);

// ===== NHÓM STORE / DONOR (Chủ Bài Đăng) =====

// [GET] /api/transactions/posts/:postId
// (P2P: hiện PENDING, B2C: hiện ACCEPTED)
router.get('/posts/:postId', verifyAuth, getPostTransactions);

// [PATCH] /api/transactions/:id/respond
// (P2P & B2C: chủ post/store accept/reject — B2C sinh VietQR khi ACCEPT)
router.patch('/:id/respond', verifyAuth, respondToRequest);

// [PATCH] /api/transactions/:id/cancel
// (Store hủy đơn B2C đang ACCEPTED)
router.patch('/:id/cancel', verifyAuth, cancelOrderByStore);

// [PATCH] /api/transactions/:id/confirm-receipt
// (Store xác nhận đã nhận tiền → COMPLETED)
router.patch('/:id/confirm-receipt', verifyAuth, confirmReceiptByStore);

// [POST] /api/transactions/scan
// (P2P: Buyer quét QR từ người cho để hoàn tất)
router.post('/scan', verifyAuth, scanQrAndComplete);

// ===== NHÓM ADMIN =====

// [GET] /api/transactions/admin
router.get('/admin', verifyAuth, verifyAdmin, adminGetTransactions);

// [PATCH] /api/transactions/admin/:id/status
router.patch(
  '/admin/:id/status',
  verifyAuth,
  verifyAdmin,
  adminForceUpdateStatus
);

// ===== DEV ONLY =====

// [POST] /api/transactions/dev/complete/:id
router.post('/dev/complete/:id', verifyAuth, devCompleteTransaction);

// [GET] /api/transactions/:id
// PHẢI đặt CUỐI CÙNG để tránh /admin, /me, /as-owner bị bắt nhầm
router.get('/:id', verifyAuth, getTransactionById);

export default router;

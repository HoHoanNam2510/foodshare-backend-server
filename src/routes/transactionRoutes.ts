import { Router } from 'express';
import {
  createRequest,
  updateOrDeleteRequest,
  getPostTransactions,
  respondToRequest,
  scanQrAndComplete,
  getPaymentQR,
  createOrder,
  adminConfirmPayment,
  getMyTransactions,
  getMyTransactionsAsOwner,
  getTransactionById,
  cancelOrderByStore,
  fileDispute,
  adminGetTransactions,
  adminForceUpdateStatus,
  adminRefundTransaction,
  adminDisburseEscrow,
  adminGetEscrows,
  adminGetEscrowStats,
  adminResolveDispute,
  devCompleteTransaction,
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
// (Xem lịch sử giao dịch của tôi — tư cách Người nhận/Người mua)
router.get('/me', verifyAuth, getMyTransactions);

// [GET] /api/transactions/as-owner
// (Xem giao dịch của tôi — tư cách Người cho/Cửa hàng)
router.get('/as-owner', verifyAuth, getMyTransactionsAsOwner);

// [POST] /api/transactions/orders
// (TRX_F07: Đặt mua túi mù B2C)
router.post('/orders', verifyAuth, createOrder);

// [GET] /api/transactions/orders/:id/qr
// (Lấy thông tin QR chuyển khoản VietQR cho đơn hàng PENDING)
router.get('/orders/:id/qr', verifyAuth, getPaymentQR);

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

// [PATCH] /api/transactions/:id/dispute
// (Buyer khiếu nại đơn hàng B2C đang ESCROWED)
router.patch('/:id/dispute', verifyAuth, fileDispute);

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

// [POST] /api/transactions/admin/:id/confirm-payment
// (Admin xác nhận đã nhận tiền chuyển khoản → ESCROWED)
router.post('/admin/:id/confirm-payment', verifyAuth, verifyAdmin, adminConfirmPayment);

// [POST] /api/transactions/admin/:id/refund
// (Admin hoàn tiền giao dịch ESCROWED/DISPUTED — xử lý chuyển khoản thủ công)
router.post('/admin/:id/refund', verifyAuth, verifyAdmin, adminRefundTransaction);

// [POST] /api/transactions/admin/:id/disburse
// (Admin giải ngân escrow cho store)
router.post('/admin/:id/disburse', verifyAuth, verifyAdmin, adminDisburseEscrow);

// [PATCH] /api/transactions/admin/:id/resolve-dispute
// (Admin xử lý khiếu nại — REFUND hoặc DISBURSE)
router.patch('/admin/:id/resolve-dispute', verifyAuth, verifyAdmin, adminResolveDispute);

// [GET] /api/transactions/admin/escrows
// (Admin xem danh sách escrow)
router.get('/admin/escrows', verifyAuth, verifyAdmin, adminGetEscrows);

// [GET] /api/transactions/admin/escrow-stats
// (Admin xem thống kê escrow)
router.get('/admin/escrow-stats', verifyAuth, verifyAdmin, adminGetEscrowStats);

// ===== DEV ONLY =====

// [POST] /api/transactions/dev/complete/:id
// (Hoàn tất giao dịch không cần quét QR — chỉ NODE_ENV=development)
router.post('/dev/complete/:id', verifyAuth, devCompleteTransaction);

// [GET] /api/transactions/:id
// (TRX_F14: Xem chi tiết giao dịch — cả Receiver lẫn Donor đều dùng được)
// PHẢI đặt CUỐI CÙNG — sau tất cả các route tĩnh để tránh /admin, /me, /as-owner bị bắt nhầm
router.get('/:id', verifyAuth, getTransactionById);

export default router;

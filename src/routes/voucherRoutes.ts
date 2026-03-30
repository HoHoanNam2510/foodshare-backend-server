import { Router } from 'express';
import {
  storeCreateVoucher,
  storeUpdateVoucher,
  storeToggleVoucher,
  getVoucherMarket,
  redeemVoucher,
  getMyVouchers,
  adminGetVouchers,
  adminToggleVoucher,
} from '@/controllers/voucherController';
import { verifyAuth, verifyAdmin } from '@/middlewares/authMiddleware';
import { validateBody } from '@/middlewares/validateBodyMiddleware';
import {
  createVoucherSchema,
  updateVoucherSchema,
} from '@/validations/voucherValidation';

const router = Router();

// =============================================
// NHÓM ADMIN (đặt trước để tránh conflict với param route)
// =============================================

// [GET] /api/vouchers/admin
// (Admin xem danh sách toàn bộ Voucher + lọc + phân trang)
router.get('/admin', verifyAuth, verifyAdmin, adminGetVouchers);

// [PATCH] /api/vouchers/admin/:id/toggle
// (Admin khóa/mở Voucher vi phạm)
router.patch('/admin/:id/toggle', verifyAuth, verifyAdmin, adminToggleVoucher);

// =============================================
// NHÓM USER (yêu cầu đăng nhập)
// =============================================

// [GET] /api/vouchers/market
// (Xem danh sách Voucher trên Chợ Voucher — public nhưng cần auth nếu muốn đổi)
router.get('/market', getVoucherMarket);

// [GET] /api/vouchers/me
// (Xem Voucher trong ví của tôi)
router.get('/me', verifyAuth, getMyVouchers);

// [POST] /api/vouchers/:id/redeem
// (Đổi điểm lấy Voucher)
router.post('/:id/redeem', verifyAuth, redeemVoucher);

// =============================================
// NHÓM STORE (yêu cầu đăng nhập — role STORE)
// =============================================

// [POST] /api/vouchers
// (Cửa hàng tạo Voucher mới)
router.post(
  '/',
  verifyAuth,
  validateBody(createVoucherSchema),
  storeCreateVoucher
);

// [PUT] /api/vouchers/:id
// (Cửa hàng cập nhật Voucher)
router.put(
  '/:id',
  verifyAuth,
  validateBody(updateVoucherSchema),
  storeUpdateVoucher
);

// [PATCH] /api/vouchers/:id/toggle
// (Cửa hàng khóa/mở lại Voucher)
router.patch('/:id/toggle', verifyAuth, storeToggleVoucher);

export default router;

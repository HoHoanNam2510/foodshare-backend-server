import { Request, Response } from 'express';

import {
  VoucherServiceError,
  storeCreateVoucher as storeCreateVoucherService,
  storeUpdateVoucher as storeUpdateVoucherService,
  storeToggleVoucher as storeToggleVoucherService,
  storeGetMyVouchers as storeGetMyVouchersService,
  getVoucherMarket as getVoucherMarketService,
  redeemVoucher as redeemVoucherService,
  getMyVouchers as getMyVouchersService,
  adminToggleVoucher as adminToggleVoucherService,
  adminGetVouchers as adminGetVouchersService,
} from '@/services/voucherService';

function handleVoucherError(error: unknown, res: Response): void {
  if (error instanceof VoucherServiceError) {
    res.status(error.statusCode).json({
      success: false,
      message: error.message,
    });
    return;
  }

  const message = error instanceof Error ? error.message : 'Lỗi không xác định';
  console.error('❌ Voucher Error:', message);
  res.status(500).json({
    success: false,
    message: 'Đã xảy ra lỗi từ phía server',
  });
}

// =============================================
// I. NHÓM HANDLER DÀNH CHO STORE
// =============================================

/**
 * [POST] /api/vouchers
 * VOU_F01: Cửa hàng tạo mã giảm giá mới.
 */
export const storeCreateVoucher = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const creatorId = req.user?.id;
    if (!creatorId) {
      res.status(401).json({
        success: false,
        message: 'Bạn cần đăng nhập để thực hiện thao tác này',
      });
      return;
    }

    const voucher = await storeCreateVoucherService(creatorId, req.body);

    res.status(201).json({
      success: true,
      message: 'Tạo voucher thành công',
      data: voucher,
    });
  } catch (error) {
    handleVoucherError(error, res);
  }
};

/**
 * [PUT] /api/vouchers/:id
 * Cửa hàng cập nhật thông tin Voucher.
 */
export const storeUpdateVoucher = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const creatorId = req.user?.id;
    if (!creatorId) {
      res.status(401).json({
        success: false,
        message: 'Bạn cần đăng nhập để thực hiện thao tác này',
      });
      return;
    }

    const voucherId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : req.params.id;

    const voucher = await storeUpdateVoucherService(
      voucherId,
      creatorId,
      req.body
    );

    res.status(200).json({
      success: true,
      message: 'Cập nhật voucher thành công',
      data: voucher,
    });
  } catch (error) {
    handleVoucherError(error, res);
  }
};

/**
 * [PATCH] /api/vouchers/:id/toggle
 * Cửa hàng khóa/mở lại Voucher.
 */
export const storeToggleVoucher = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const creatorId = req.user?.id;
    if (!creatorId) {
      res.status(401).json({
        success: false,
        message: 'Bạn cần đăng nhập để thực hiện thao tác này',
      });
      return;
    }

    const voucherId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : req.params.id;

    const voucher = await storeToggleVoucherService(voucherId, creatorId);

    res.status(200).json({
      success: true,
      message: voucher.isActive
        ? 'Đã mở lại voucher'
        : 'Đã ngừng phát hành voucher',
      data: voucher,
    });
  } catch (error) {
    handleVoucherError(error, res);
  }
};

/**
 * [GET] /api/vouchers/store/mine
 * VOU_STORE_MINE: Cửa hàng xem danh sách voucher do mình tạo.
 */
export const storeGetMyVouchers = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const storeId = req.user?.id;
    if (!storeId) {
      res.status(401).json({
        success: false,
        message: 'Bạn cần đăng nhập để thực hiện thao tác này',
      });
      return;
    }

    const vouchers = await storeGetMyVouchersService(storeId);

    res.status(200).json({
      success: true,
      data: vouchers,
    });
  } catch (error) {
    handleVoucherError(error, res);
  }
};

// =============================================
// II. NHÓM HANDLER DÀNH CHO USER
// =============================================

/**
 * [GET] /api/vouchers/market
 * VOU_F03: Xem danh sách Voucher trên Chợ Voucher.
 */
export const getVoucherMarket = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { sort, discountType, page, limit } = req.query;

    const result = await getVoucherMarketService({
      sort: sort as string | undefined,
      discountType: discountType as 'PERCENTAGE' | 'FIXED_AMOUNT' | undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });

    res.status(200).json({
      success: true,
      data: result.data,
      pagination: result.pagination,
    });
  } catch (error) {
    handleVoucherError(error, res);
  }
};

/**
 * [POST] /api/vouchers/:id/redeem
 * VOU_F02: Đổi điểm lấy Voucher.
 */
export const redeemVoucher = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Bạn cần đăng nhập để thực hiện thao tác này',
      });
      return;
    }

    const voucherId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : req.params.id;

    const userVoucher = await redeemVoucherService(userId, voucherId);

    res.status(200).json({
      success: true,
      message: 'Đổi voucher thành công! Voucher đã được thêm vào ví của bạn.',
      data: userVoucher,
    });
  } catch (error) {
    handleVoucherError(error, res);
  }
};

/**
 * [GET] /api/vouchers/me
 * VOU_F04: Lấy danh sách Voucher trong ví của user.
 */
export const getMyVouchers = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Bạn cần đăng nhập để thực hiện thao tác này',
      });
      return;
    }

    const statusFilter = req.query.status as
      | 'UNUSED'
      | 'USED'
      | 'EXPIRED'
      | undefined;

    const vouchers = await getMyVouchersService(userId, statusFilter);

    res.status(200).json({
      success: true,
      data: vouchers,
    });
  } catch (error) {
    handleVoucherError(error, res);
  }
};

// =============================================
// III. NHÓM HANDLER DÀNH CHO ADMIN
// =============================================

/**
 * [GET] /api/vouchers/admin
 * Admin xem danh sách toàn bộ Voucher.
 */
export const adminGetVouchers = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { isActive, creatorId, page, limit } = req.query;

    const result = await adminGetVouchersService({
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
      creatorId: creatorId as string | undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });

    res.status(200).json({
      success: true,
      data: result.data,
      pagination: result.pagination,
    });
  } catch (error) {
    handleVoucherError(error, res);
  }
};

/**
 * [PATCH] /api/vouchers/admin/:id/toggle
 * ADM_V01, ADM_V02: Admin khóa/mở Voucher vi phạm.
 */
export const adminToggleVoucher = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const voucherId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : req.params.id;

    const voucher = await adminToggleVoucherService(voucherId);

    res.status(200).json({
      success: true,
      message: voucher.isActive ? 'Đã mở lại voucher' : 'Đã khóa voucher',
      data: voucher,
    });
  } catch (error) {
    handleVoucherError(error, res);
  }
};

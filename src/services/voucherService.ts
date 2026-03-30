import mongoose from 'mongoose';

import Voucher, { IVoucher } from '@/models/Voucher';
import UserVoucher, { IUserVoucher } from '@/models/UserVoucher';
import User from '@/models/User';
import { deductPointsForVoucher } from '@/services/greenPointService';

export class VoucherServiceError extends Error {
  public statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
  }
}

// =============================================
// I. NHÓM SERVICE DÀNH CHO STORE
// =============================================

interface CreateVoucherInput {
  code: string;
  title: string;
  description?: string;
  discountType: 'PERCENTAGE' | 'FIXED_AMOUNT';
  discountValue: number;
  pointCost: number;
  totalQuantity: number;
  validFrom: string;
  validUntil: string;
}

/**
 * VOU_F01: Cửa hàng tạo mã giảm giá mới.
 */
export async function storeCreateVoucher(
  creatorId: string,
  data: CreateVoucherInput
): Promise<IVoucher> {
  const {
    code,
    title,
    description,
    discountType,
    discountValue,
    pointCost,
    totalQuantity,
    validFrom,
    validUntil,
  } = data;

  const fromDate = new Date(validFrom);
  const untilDate = new Date(validUntil);

  // Validate: validUntil phải lớn hơn validFrom
  if (untilDate <= fromDate) {
    throw new VoucherServiceError(
      'Ngày hết hạn (validUntil) phải lớn hơn ngày bắt đầu (validFrom)',
      400
    );
  }

  // Kiểm tra code không bị trùng
  const existingVoucher = await Voucher.findOne({ code: code.toUpperCase() });
  if (existingVoucher) {
    throw new VoucherServiceError(
      `Mã voucher "${code.toUpperCase()}" đã tồn tại trên hệ thống`,
      409
    );
  }

  const voucher = await Voucher.create({
    creatorId,
    code,
    title,
    description,
    discountType,
    discountValue,
    pointCost,
    totalQuantity,
    remainingQuantity: totalQuantity,
    validFrom: fromDate,
    validUntil: untilDate,
    isActive: true,
  });

  return voucher;
}

interface UpdateVoucherInput {
  title?: string;
  description?: string;
  discountType?: 'PERCENTAGE' | 'FIXED_AMOUNT';
  discountValue?: number;
  pointCost?: number;
  code?: string;
  totalQuantity?: number;
  validUntil?: string;
}

/**
 * Bổ sung mới: Cửa hàng cập nhật thông tin Voucher.
 * Có ràng buộc bảo vệ nếu đã có user đổi mã.
 */
export async function storeUpdateVoucher(
  voucherId: string,
  creatorId: string,
  data: UpdateVoucherInput
): Promise<IVoucher> {
  if (!mongoose.Types.ObjectId.isValid(voucherId)) {
    throw new VoucherServiceError('Voucher ID không hợp lệ', 400);
  }

  const voucher = await Voucher.findOne({ _id: voucherId, creatorId });
  if (!voucher) {
    throw new VoucherServiceError(
      'Không tìm thấy voucher hoặc bạn không có quyền sửa',
      404
    );
  }

  // Ràng buộc logic cốt lõi:
  // Nếu đã có khách hàng đổi mã (remainingQuantity < totalQuantity)
  // → KHÔNG ĐƯỢC sửa discountType, discountValue, pointCost, code
  const hasBeenRedeemed = voucher.remainingQuantity < voucher.totalQuantity;

  if (hasBeenRedeemed) {
    const restrictedFields: (keyof UpdateVoucherInput)[] = [
      'discountType',
      'discountValue',
      'pointCost',
      'code',
    ];

    for (const field of restrictedFields) {
      if (data[field] !== undefined) {
        throw new VoucherServiceError(
          `Không thể sửa trường "${field}" vì đã có khách hàng đổi mã này. Chỉ được sửa title, description hoặc gia hạn validUntil.`,
          400
        );
      }
    }
  }

  // Áp dụng các trường cập nhật
  if (data.title !== undefined) voucher.title = data.title;
  if (data.description !== undefined) voucher.description = data.description;

  if (!hasBeenRedeemed) {
    if (data.discountType !== undefined)
      voucher.discountType = data.discountType;
    if (data.discountValue !== undefined)
      voucher.discountValue = data.discountValue;
    if (data.pointCost !== undefined) voucher.pointCost = data.pointCost;
    if (data.code !== undefined) voucher.code = data.code;
    if (data.totalQuantity !== undefined) {
      voucher.totalQuantity = data.totalQuantity;
      voucher.remainingQuantity = data.totalQuantity;
    }
  }

  if (data.validUntil !== undefined) {
    const newUntil = new Date(data.validUntil);
    if (newUntil <= voucher.validFrom) {
      throw new VoucherServiceError(
        'Ngày hết hạn mới phải lớn hơn ngày bắt đầu',
        400
      );
    }
    voucher.validUntil = newUntil;
  }

  await voucher.save();
  return voucher;
}

/**
 * Bổ sung mới: Cửa hàng khóa/mở lại Voucher (soft toggle).
 */
export async function storeToggleVoucher(
  voucherId: string,
  creatorId: string
): Promise<IVoucher> {
  if (!mongoose.Types.ObjectId.isValid(voucherId)) {
    throw new VoucherServiceError('Voucher ID không hợp lệ', 400);
  }

  const voucher = await Voucher.findOne({ _id: voucherId, creatorId });
  if (!voucher) {
    throw new VoucherServiceError(
      'Không tìm thấy voucher hoặc bạn không có quyền',
      404
    );
  }

  voucher.isActive = !voucher.isActive;
  await voucher.save();

  return voucher;
}

// =============================================
// II. NHÓM SERVICE DÀNH CHO USER
// =============================================

interface VoucherMarketQuery {
  sort?: string;
  discountType?: 'PERCENTAGE' | 'FIXED_AMOUNT';
  page?: number;
  limit?: number;
}

interface PaginatedVoucherResult {
  data: IVoucher[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * VOU_F03: Xem danh sách Voucher đang có sẵn trên Chợ Voucher.
 */
export async function getVoucherMarket(
  query: VoucherMarketQuery
): Promise<PaginatedVoucherResult> {
  const { sort, discountType, page = 1, limit = 20 } = query;

  const filter: Record<string, unknown> = {
    isActive: true,
    remainingQuantity: { $gt: 0 },
    validUntil: { $gt: new Date() },
  };

  if (discountType) {
    filter.discountType = discountType;
  }

  // Xác định hướng sắp xếp
  let sortOption: Record<string, 1 | -1> = { createdAt: -1 };
  if (sort === 'pointCost_asc') sortOption = { pointCost: 1 };
  if (sort === 'pointCost_desc') sortOption = { pointCost: -1 };
  if (sort === 'newest') sortOption = { createdAt: -1 };
  if (sort === 'expiring') sortOption = { validUntil: 1 };

  const skip = (page - 1) * limit;

  const [vouchers, total] = await Promise.all([
    Voucher.find(filter)
      .populate('creatorId', 'fullName avatar storeInfo')
      .sort(sortOption)
      .skip(skip)
      .limit(limit)
      .lean(),
    Voucher.countDocuments(filter),
  ]);

  return {
    data: vouchers as IVoucher[],
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * VOU_F02: Đổi điểm lấy Voucher — trái tim của hệ thống.
 * Cross-update: User.greenPoints, Voucher.remainingQuantity, PointLog, UserVoucher.
 */
export async function redeemVoucher(
  userId: string,
  voucherId: string
): Promise<IUserVoucher> {
  if (!mongoose.Types.ObjectId.isValid(voucherId)) {
    throw new VoucherServiceError('Voucher ID không hợp lệ', 400);
  }

  // Lấy thông tin Voucher
  const voucher = await Voucher.findById(voucherId);
  if (!voucher) {
    throw new VoucherServiceError('Không tìm thấy voucher', 404);
  }

  // Kiểm tra voucher còn hoạt động
  if (!voucher.isActive) {
    throw new VoucherServiceError('Voucher này đã ngừng phát hành', 400);
  }

  // Kiểm tra còn số lượng
  if (voucher.remainingQuantity <= 0) {
    throw new VoucherServiceError('Voucher đã hết lượt đổi', 400);
  }

  // Kiểm tra còn hạn sử dụng
  if (new Date() > voucher.validUntil) {
    throw new VoucherServiceError('Voucher đã hết hạn', 400);
  }

  // Chống gian lận: Store không được tự đổi voucher của mình
  if (voucher.creatorId.toString() === userId) {
    throw new VoucherServiceError(
      'Bạn không thể đổi voucher do chính mình tạo ra',
      403
    );
  }

  // Kiểm tra đủ điểm
  const user = await User.findById(userId).select('greenPoints');
  if (!user) {
    throw new VoucherServiceError('Không tìm thấy người dùng', 404);
  }

  if (user.greenPoints < voucher.pointCost) {
    throw new VoucherServiceError(
      `Bạn không đủ điểm để đổi. Cần ${voucher.pointCost} điểm, hiện có ${user.greenPoints} điểm.`,
      400
    );
  }

  // Cross-update 1: Trừ remainingQuantity của Voucher
  voucher.remainingQuantity -= 1;
  await voucher.save();

  // Cross-update 2 + 3: Trừ greenPoints của User + Tạo PointLog
  await deductPointsForVoucher(userId, voucher.pointCost, voucherId);

  // Cross-update 4: Tạo UserVoucher
  const userVoucher = await UserVoucher.create({
    userId,
    voucherId,
    status: 'UNUSED',
  });

  return userVoucher;
}

/**
 * VOU_F04: Lấy danh sách Voucher trong ví của user.
 * Tự động check expired dựa trên validUntil của Voucher gốc.
 */
export async function getMyVouchers(
  userId: string,
  statusFilter?: 'UNUSED' | 'USED' | 'EXPIRED'
): Promise<IUserVoucher[]> {
  const filter: Record<string, unknown> = { userId };
  if (statusFilter) {
    filter.status = statusFilter;
  }

  const userVouchers = await UserVoucher.find(filter)
    .populate('voucherId')
    .sort({ createdAt: -1 })
    .lean();

  // Tự động ép status thành EXPIRED nếu voucher gốc đã hết hạn
  const now = new Date();
  const processed = userVouchers.map((uv) => {
    const voucher = uv.voucherId as unknown as IVoucher;
    if (
      uv.status === 'UNUSED' &&
      voucher &&
      voucher.validUntil &&
      new Date(voucher.validUntil) < now
    ) {
      return { ...uv, status: 'EXPIRED' as const };
    }
    return uv;
  });

  // Nếu có filter EXPIRED, cần bao gồm cả các voucher UNUSED nhưng đã hết hạn
  if (statusFilter === 'EXPIRED') {
    return processed.filter((uv) => uv.status === 'EXPIRED') as IUserVoucher[];
  }

  // Nếu filter UNUSED, loại bỏ những voucher thực tế đã expired
  if (statusFilter === 'UNUSED') {
    return processed.filter((uv) => uv.status === 'UNUSED') as IUserVoucher[];
  }

  return processed as IUserVoucher[];
}

// =============================================
// III. NHÓM SERVICE DÀNH CHO ADMIN
// =============================================

/**
 * ADM_V01, ADM_V02: Admin khóa/mở Voucher vi phạm.
 */
export async function adminToggleVoucher(voucherId: string): Promise<IVoucher> {
  if (!mongoose.Types.ObjectId.isValid(voucherId)) {
    throw new VoucherServiceError('Voucher ID không hợp lệ', 400);
  }

  const voucher = await Voucher.findById(voucherId);
  if (!voucher) {
    throw new VoucherServiceError('Không tìm thấy voucher', 404);
  }

  voucher.isActive = !voucher.isActive;
  await voucher.save();

  return voucher;
}

interface AdminGetVouchersQuery {
  isActive?: boolean;
  creatorId?: string;
  page?: number;
  limit?: number;
}

interface PaginatedAdminVoucherResult {
  data: IVoucher[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Admin xem danh sách toàn bộ Voucher, hỗ trợ lọc & phân trang.
 */
export async function adminGetVouchers(
  query: AdminGetVouchersQuery
): Promise<PaginatedAdminVoucherResult> {
  const { isActive, creatorId, page = 1, limit = 20 } = query;

  const filter: Record<string, unknown> = {};
  if (isActive !== undefined) filter.isActive = isActive;
  if (creatorId) filter.creatorId = creatorId;

  const skip = (page - 1) * limit;

  const [vouchers, total] = await Promise.all([
    Voucher.find(filter)
      .populate('creatorId', 'fullName email avatar storeInfo')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Voucher.countDocuments(filter),
  ]);

  return {
    data: vouchers as IVoucher[],
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

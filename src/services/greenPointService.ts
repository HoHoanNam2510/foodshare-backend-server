import mongoose from 'mongoose';

import User from '@/models/User';
import PointLog, { IPointLog } from '@/models/PointLog';

export class GreenPointServiceError extends Error {
  public statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
  }
}

// Hằng số điểm thưởng
const P2P_REQUESTER_POINTS = 5;
const P2P_OWNER_POINTS = 10;
const B2C_REQUESTER_POINTS = 5;
const B2C_OWNER_POINTS = 5;

// =============================================
// I. NHÓM SERVICE DÀNH CHO USER
// =============================================

interface PointHistoryQuery {
  page?: number;
  limit?: number;
}

interface PointHistoryResult {
  greenPoints: number;
  logs: IPointLog[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * RWD_F01: Xem biến động số dư Green Points của tài khoản.
 */
export async function getPointHistory(
  userId: string,
  query: PointHistoryQuery
): Promise<PointHistoryResult> {
  const { page = 1, limit = 20 } = query;

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new GreenPointServiceError('User ID không hợp lệ', 400);
  }

  const user = await User.findById(userId).select('greenPoints');
  if (!user) {
    throw new GreenPointServiceError('Không tìm thấy người dùng', 404);
  }

  const skip = (page - 1) * limit;

  const [logs, total] = await Promise.all([
    PointLog.find({ userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    PointLog.countDocuments({ userId }),
  ]);

  return {
    greenPoints: user.greenPoints,
    logs: logs as IPointLog[],
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

// =============================================
// II. NHÓM SERVICE NỘI BỘ (INTERNAL)
// =============================================

/**
 * Internal: Cộng điểm thưởng khi Transaction hoàn tất (COMPLETED).
 * Gọi từ transactionController sau khi scanQrAndComplete thành công.
 *
 * @param transactionId - ID giao dịch
 * @param type - Loại giao dịch: 'REQUEST' (P2P) hoặc 'ORDER' (B2C)
 * @param requesterId - ID người nhận/người mua
 * @param ownerId - ID người cho/cửa hàng
 */
export async function awardTransactionPoints(
  transactionId: string,
  type: 'REQUEST' | 'ORDER',
  requesterId: string,
  ownerId: string
): Promise<void> {
  const requesterPoints =
    type === 'REQUEST' ? P2P_REQUESTER_POINTS : B2C_REQUESTER_POINTS;
  const ownerPoints = type === 'REQUEST' ? P2P_OWNER_POINTS : B2C_OWNER_POINTS;

  const transactionLabel = type === 'REQUEST' ? 'P2P' : 'B2C';

  // Cộng điểm cho cả 2 user song song
  await Promise.all([
    // Cộng điểm cho requester
    User.findByIdAndUpdate(requesterId, {
      $inc: { greenPoints: requesterPoints },
    }),
    // Cộng điểm cho owner
    User.findByIdAndUpdate(ownerId, {
      $inc: { greenPoints: ownerPoints },
    }),
    // Tạo PointLog cho requester
    PointLog.create({
      userId: requesterId,
      amount: requesterPoints,
      reason: `Hoàn tất giao dịch ${transactionLabel} — Người nhận`,
      referenceId: new mongoose.Types.ObjectId(transactionId),
    }),
    // Tạo PointLog cho owner
    PointLog.create({
      userId: ownerId,
      amount: ownerPoints,
      reason: `Hoàn tất giao dịch ${transactionLabel} — Người chia sẻ`,
      referenceId: new mongoose.Types.ObjectId(transactionId),
    }),
  ]);
}

/**
 * Internal: Trừ điểm phạt khi bị Report.
 * Gọi từ reportService khi admin xử lý report (USER_WARNED / USER_BANNED).
 *
 * @param userId - ID user bị phạt
 * @param penaltyAmount - Số điểm bị trừ (giá trị dương)
 * @param reportId - ID report gây ra hình phạt
 * @param reason - Lý do vi phạm
 */
export async function applyPenaltyPoints(
  userId: string,
  penaltyAmount: number,
  reportId: string,
  reason: string
): Promise<void> {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new GreenPointServiceError('User ID không hợp lệ', 400);
  }

  // Trừ điểm (có thể rơi xuống số âm theo design doc)
  await User.findByIdAndUpdate(userId, {
    $inc: { greenPoints: -penaltyAmount },
  });

  // Tạo PointLog ghi nhận lịch sử trừ điểm
  await PointLog.create({
    userId,
    amount: -penaltyAmount,
    reason,
    referenceId: new mongoose.Types.ObjectId(reportId),
  });
}

/**
 * Internal: Trừ điểm khi user đổi voucher.
 * Gọi từ voucherService khi redeemVoucher.
 *
 * @param userId - ID user đổi voucher
 * @param pointCost - Số điểm bị trừ
 * @param voucherId - ID voucher được đổi
 */
export async function deductPointsForVoucher(
  userId: string,
  pointCost: number,
  voucherId: string
): Promise<void> {
  await User.findByIdAndUpdate(userId, {
    $inc: { greenPoints: -pointCost },
  });

  await PointLog.create({
    userId,
    amount: -pointCost,
    reason: 'Đổi điểm lấy Voucher',
    referenceId: new mongoose.Types.ObjectId(voucherId),
  });
}

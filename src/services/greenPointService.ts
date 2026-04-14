import mongoose from 'mongoose';

import User from '@/models/User';
import PointLog, { IPointLog } from '@/models/PointLog';
import { checkAndAwardBadges } from '@/services/badgeService';

export class GreenPointServiceError extends Error {
  public statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
  }
}

// Hằng số điểm thưởng (P2P: Receiver = 3 pts, Donor = 10 pts — theo P2P_TRANSACTION.md)
const P2P_REQUESTER_POINTS = 3;
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
 * Internal: Cộng điểm thưởng cho user và ghi log.
 * Sau khi cộng điểm, trigger GREENPOINTS_AWARDED để kiểm tra các badge mốc điểm.
 *
 * @param userId - ID user nhận điểm
 * @param amount - Số điểm cộng (giá trị dương)
 * @param reason - Lý do nhận điểm
 * @param referenceId - ObjectId tham chiếu (badge, transaction, ...)
 */
export async function awardGreenPoints(
  userId: string,
  amount: number,
  reason: string,
  referenceId?: mongoose.Types.ObjectId
): Promise<void> {
  await Promise.all([
    User.findByIdAndUpdate(userId, { $inc: { greenPoints: amount } }),
    PointLog.create({ userId, amount, reason, referenceId }),
  ]);

  // Trigger badge check sau khi điểm được cập nhật vào DB
  try {
    await checkAndAwardBadges(userId, 'GREENPOINTS_AWARDED');
  } catch (err) {
    console.warn(
      '[GreenPointService] badge check after awardGreenPoints failed:',
      err
    );
  }
}

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

  // Trigger GREENPOINTS_AWARDED badge check cho cả 2 user
  try {
    await checkAndAwardBadges(requesterId, 'GREENPOINTS_AWARDED');
  } catch (err) {
    console.warn('[GreenPointService] badge check (requester) failed:', err);
  }
  try {
    await checkAndAwardBadges(ownerId, 'GREENPOINTS_AWARDED');
  } catch (err) {
    console.warn('[GreenPointService] badge check (owner) failed:', err);
  }
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

// =============================================
// III. NHÓM SERVICE DÀNH CHO ADMIN
// =============================================

export type LeaderboardPeriod = 'daily' | 'weekly' | 'monthly' | 'yearly';
export type LeaderboardRole = 'USER' | 'STORE' | 'ALL';

interface LeaderboardQuery {
  period?: LeaderboardPeriod;
  limit?: number;
  role?: LeaderboardRole;
  currentUserId?: string;
}

interface LeaderboardUserInfo {
  _id: string;
  fullName: string;
  avatar?: string;
  role: 'USER' | 'STORE' | 'ADMIN';
}

interface LeaderboardEntry {
  rank: number;
  user: LeaderboardUserInfo;
  periodPoints: number;
  totalPoints: number;
}

interface MyRankSummary {
  rank: number | null;
  periodPoints: number;
  totalPoints: number;
}

interface LeaderboardResult {
  period: LeaderboardPeriod;
  startDate: Date;
  endDate: Date;
  leaderboard: LeaderboardEntry[];
  myRank: MyRankSummary | null;
}

interface MyRankingSummaryResult {
  daily: MyRankSummary;
  weekly: MyRankSummary;
  monthly: MyRankSummary;
  yearly: MyRankSummary;
}

interface AdminPointLogsQuery {
  userId?: string;
  page?: number;
  limit?: number;
}

interface AdminPointLogsResult {
  logs: (IPointLog & {
    userId: { _id: string; fullName: string; email: string };
  })[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Admin xem toàn bộ lịch sử biến động Green Points, có thể lọc theo userId.
 */
function getPeriodRange(period: LeaderboardPeriod): {
  startDate: Date;
  endDate: Date;
} {
  const now = new Date();
  const startDate = new Date(now);
  const endDate = new Date(now);

  switch (period) {
    case 'daily': {
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);
      break;
    }
    case 'weekly': {
      const day = now.getDay();
      const diffToMonday = day === 0 ? 6 : day - 1;
      startDate.setDate(now.getDate() - diffToMonday);
      startDate.setHours(0, 0, 0, 0);

      endDate.setDate(startDate.getDate() + 6);
      endDate.setHours(23, 59, 59, 999);
      break;
    }
    case 'monthly': {
      startDate.setDate(1);
      startDate.setHours(0, 0, 0, 0);

      endDate.setMonth(now.getMonth() + 1, 0);
      endDate.setHours(23, 59, 59, 999);
      break;
    }
    case 'yearly': {
      startDate.setMonth(0, 1);
      startDate.setHours(0, 0, 0, 0);

      endDate.setMonth(11, 31);
      endDate.setHours(23, 59, 59, 999);
      break;
    }
    default:
      break;
  }

  return { startDate, endDate };
}

async function buildPeriodPointsMap(
  period: LeaderboardPeriod,
  role: LeaderboardRole
): Promise<Map<string, number>> {
  const { startDate, endDate } = getPeriodRange(period);

  const matchStage: Record<string, unknown> = {
    createdAt: { $gte: startDate, $lte: endDate },
    amount: { $gt: 0 },
  };

  const pipeline: mongoose.PipelineStage[] = [
    { $match: matchStage },
    {
      $group: {
        _id: '$userId',
        periodPoints: { $sum: '$amount' },
      },
    },
  ];

  if (role !== 'ALL') {
    pipeline.push(
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'userInfo',
        },
      },
      { $unwind: '$userInfo' },
      { $match: { 'userInfo.role': role } }
    );
  }

  const rows = await PointLog.aggregate(pipeline);

  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(String(row._id), Number(row.periodPoints) || 0);
  }
  return map;
}

/**
 * RWD_F02: Leaderboard theo kỳ (daily/weekly/monthly/yearly)
 */
export async function getLeaderboard(
  query: LeaderboardQuery
): Promise<LeaderboardResult> {
  const period: LeaderboardPeriod = query.period || 'weekly';
  const role: LeaderboardRole = query.role || 'ALL';
  const limit = Math.min(Math.max(query.limit || 20, 1), 100);

  const { startDate, endDate } = getPeriodRange(period);
  const pointsMap = await buildPeriodPointsMap(period, role);
  const userIds = Array.from(pointsMap.keys());

  if (userIds.length === 0) {
    return {
      period,
      startDate,
      endDate,
      leaderboard: [],
      myRank: null,
    };
  }

  const users = await User.find({ _id: { $in: userIds } })
    .select('fullName avatar role greenPoints')
    .lean();

  const rows = users
    .map((u) => {
      const id = String(u._id);
      return {
        user: {
          _id: id,
          fullName: u.fullName,
          avatar: u.avatar,
          role: u.role,
        } as LeaderboardUserInfo,
        periodPoints: pointsMap.get(id) || 0,
        totalPoints: u.greenPoints || 0,
      };
    })
    .filter((r) => (role === 'ALL' ? true : r.user.role === role))
    .sort((a, b) => b.periodPoints - a.periodPoints);

  const ranked = rows.map((row, index) => ({
    rank: index + 1,
    ...row,
  }));

  const leaderboard = ranked.slice(0, limit);

  let myRank: MyRankSummary | null = null;
  if (query.currentUserId) {
    const mine = ranked.find((r) => r.user._id === query.currentUserId);
    if (mine) {
      myRank = {
        rank: mine.rank,
        periodPoints: mine.periodPoints,
        totalPoints: mine.totalPoints,
      };
    } else {
      const me = await User.findById(query.currentUserId)
        .select('greenPoints')
        .lean();
      if (
        me &&
        (role === 'ALL' ||
          role ===
            (await User.findById(query.currentUserId).select('role').lean())
              ?.role)
      ) {
        myRank = {
          rank: null,
          periodPoints: 0,
          totalPoints: me.greenPoints || 0,
        };
      }
    }
  }

  return {
    period,
    startDate,
    endDate,
    leaderboard,
    myRank,
  };
}

/**
 * RWD_F03: Tóm tắt thứ hạng của bản thân cho 4 kỳ
 */
export async function getMyRankingSummary(
  userId: string
): Promise<MyRankingSummaryResult> {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new GreenPointServiceError('User ID không hợp lệ', 400);
  }

  const me = await User.findById(userId).select('greenPoints').lean();
  if (!me) {
    throw new GreenPointServiceError('Không tìm thấy người dùng', 404);
  }

  const periods: LeaderboardPeriod[] = ['daily', 'weekly', 'monthly', 'yearly'];

  const results = await Promise.all(
    periods.map(async (period) => {
      const pointsMap = await buildPeriodPointsMap(period, 'ALL');
      const userIds = Array.from(pointsMap.keys());

      const myPeriodPoints = pointsMap.get(userId) || 0;
      const higherCount = Array.from(pointsMap.values()).filter(
        (v) => v > myPeriodPoints
      ).length;
      const rank = userIds.length > 0 ? higherCount + 1 : null;

      return [
        period,
        {
          rank,
          periodPoints: myPeriodPoints,
          totalPoints: me.greenPoints || 0,
        } as MyRankSummary,
      ] as const;
    })
  );

  return {
    daily: results.find(([p]) => p === 'daily')![1],
    weekly: results.find(([p]) => p === 'weekly')![1],
    monthly: results.find(([p]) => p === 'monthly')![1],
    yearly: results.find(([p]) => p === 'yearly')![1],
  };
}

export async function adminGetAllPointLogs(
  query: AdminPointLogsQuery
): Promise<AdminPointLogsResult> {
  const { userId, page = 1, limit = 20 } = query;

  const filter: Record<string, unknown> = {};
  if (userId && mongoose.Types.ObjectId.isValid(userId)) {
    filter.userId = userId;
  }

  const skip = (page - 1) * limit;

  const [logs, total] = await Promise.all([
    PointLog.find(filter)
      .populate('userId', 'fullName email avatar')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    PointLog.countDocuments(filter),
  ]);

  return {
    logs: logs as unknown as AdminPointLogsResult['logs'],
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
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

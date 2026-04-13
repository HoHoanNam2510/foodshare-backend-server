import mongoose from 'mongoose';

import Badge, { IBadge, TriggerEvent } from '@/models/Badge';
import UserBadge from '@/models/UserBadge';
import User from '@/models/User';
import Post from '@/models/Post';
import Transaction from '@/models/Transaction';
import Review from '@/models/Review';
import Notification from '@/models/Notification';
import PointLog from '@/models/PointLog';

// Ngày ra mắt ứng dụng — EARLY_BIRD chỉ trao cho user đăng ký trước mốc này
const LAUNCH_CUTOFF = new Date('2026-07-01T00:00:00.000Z');

// =============================================
// I. NHÓM SERVICE DÀNH CHO USER
// =============================================

/**
 * BDG_U01: Lấy toàn bộ catalog huy hiệu kèm trạng thái mở khóa của user.
 */
export async function getBadgeCatalog(userId: string): Promise<{
  total: number;
  unlocked: number;
  badges: Array<
    IBadge & { isUnlocked: boolean; unlockedAt: Date | null }
  >;
}> {
  const [badges, userBadges] = await Promise.all([
    Badge.find({ isActive: true }).sort({ sortOrder: 1 }).lean(),
    UserBadge.find({ userId }).lean(),
  ]);

  const unlockedMap = new Map<string, Date>();
  for (const ub of userBadges) {
    unlockedMap.set(ub.badgeId.toString(), ub.unlockedAt);
  }

  const enriched = badges.map((badge) => {
    const badgeId = (badge._id as mongoose.Types.ObjectId).toString();
    const unlockedAt = unlockedMap.get(badgeId) ?? null;
    return {
      ...badge,
      isUnlocked: unlockedMap.has(badgeId),
      unlockedAt,
    };
  }) as Array<IBadge & { isUnlocked: boolean; unlockedAt: Date | null }>;

  return {
    total: badges.length,
    unlocked: unlockedMap.size,
    badges: enriched,
  };
}

/**
 * BDG_U02: Lấy danh sách huy hiệu đã mở khóa của user, sắp xếp mới nhất trước.
 */
export async function getMyBadges(userId: string) {
  return UserBadge.find({ userId })
    .populate('badgeId')
    .sort({ unlockedAt: -1 })
    .lean();
}

// =============================================
// II. NHÓM SERVICE NỘI BỘ (INTERNAL SYSTEM HOOKS)
// =============================================

/**
 * Internal helper: Kiểm tra điều kiện từng badge.
 * Trả về true nếu user đủ điều kiện nhận badge.
 */
async function evaluateBadgeCondition(
  userId: string,
  badge: IBadge
): Promise<boolean> {
  const user = await User.findById(userId).lean();
  if (!user) return false;

  const ownerId = new mongoose.Types.ObjectId(userId);

  switch (badge.code) {
    case 'FIRST_STEPS':
      return user.isProfileCompleted === true;

    case 'EARLY_BIRD':
      return user.isProfileCompleted === true && user.createdAt < LAUNCH_CUTOFF;

    case 'GREEN_SEEDLING':
      return user.greenPoints >= 50;

    case 'GREEN_LEAF':
      return user.greenPoints >= 200;

    case 'GREEN_TREE':
      return user.greenPoints >= 500;

    case 'BELOVED_MEMBER': {
      const fiveStarCount = await Review.countDocuments({
        revieweeId: ownerId,
        rating: 5,
      });
      return fiveStarCount >= 5;
    }

    case 'TRUSTED_PARTNER': {
      const reviewCount = await Review.countDocuments({
        revieweeId: ownerId,
      });
      return user.averageRating >= 4.8 && reviewCount >= 10;
    }

    case 'FIRST_SHARE': {
      const p2pCount = await Post.countDocuments({
        ownerId,
        type: 'P2P_FREE',
      });
      return p2pCount >= 1;
    }

    case 'FIRST_RESCUE': {
      const rescueCount = await Transaction.countDocuments({
        requesterId: ownerId,
        type: 'REQUEST',
        status: 'COMPLETED',
      });
      return rescueCount >= 1;
    }

    case 'FOOD_HERO': {
      const heroCount = await Post.countDocuments({
        ownerId,
        type: 'P2P_FREE',
      });
      return heroCount >= 10;
    }

    case 'GENEROUS_SOUL': {
      const generousCount = await Transaction.countDocuments({
        ownerId,
        type: 'REQUEST',
        status: 'COMPLETED',
      });
      return generousCount >= 20;
    }

    case 'STORE_PIONEER':
      return user.role === 'STORE' && user.kycStatus === 'VERIFIED';

    case 'MYSTERY_MASTER': {
      const mysteryCount = await Transaction.countDocuments({
        ownerId,
        type: 'ORDER',
        status: 'COMPLETED',
      });
      return mysteryCount >= 10;
    }

    case 'ECO_CHAMPION': {
      const ecoCount = await Transaction.countDocuments({
        ownerId,
        type: 'ORDER',
        status: 'COMPLETED',
      });
      return ecoCount >= 50;
    }

    case 'GIVING_STORE': {
      if (user.role !== 'STORE') return false;
      const givingCount = await Post.countDocuments({
        ownerId,
        type: 'P2P_FREE',
      });
      return givingCount >= 3;
    }

    default:
      return false;
  }
}

/**
 * Internal: Trao huy hiệu cho user — tạo UserBadge + cộng điểm + thông báo.
 */
async function awardBadge(userId: string, badge: IBadge): Promise<void> {
  const badgeId = (badge._id as mongoose.Types.ObjectId).toString();

  // Tạo UserBadge (unique index đảm bảo không duplicate)
  await UserBadge.create({ userId, badgeId: badge._id });

  // Cộng điểm thưởng trực tiếp (không qua awardGreenPoints để tránh circular loop)
  await Promise.all([
    User.findByIdAndUpdate(userId, {
      $inc: { greenPoints: badge.pointReward },
    }),
    PointLog.create({
      userId,
      amount: badge.pointReward,
      reason: `Mở khóa huy hiệu: ${badge.name}`,
      referenceId: badge._id,
    }),
  ]);

  // Tạo thông báo in-app
  await Notification.create({
    userId,
    type: 'SYSTEM',
    title: 'Huy hiệu mới!',
    body: `Chúc mừng! Bạn vừa mở khóa huy hiệu "${badge.name}"! +${badge.pointReward} điểm`,
    referenceId: badge._id,
  });
}

/**
 * Internal: Bộ máy trung tâm — kiểm tra và trao huy hiệu sau mỗi sự kiện.
 * KHÔNG throw error — lỗi badge không được làm fail main flow.
 */
export async function checkAndAwardBadges(
  userId: string,
  triggerEvent: TriggerEvent
): Promise<void> {
  try {
    if (!mongoose.Types.ObjectId.isValid(userId)) return;

    const user = await User.findById(userId).select('role').lean();
    if (!user) return;

    // Lấy tất cả badge active có trigger event khớp
    const candidates = await Badge.find({
      triggerEvent,
      isActive: true,
    }).lean();

    if (candidates.length === 0) return;

    // Lấy set badge đã mở khóa của user
    const existingUserBadges = await UserBadge.find({ userId }).lean();
    const unlockedSet = new Set(
      existingUserBadges.map((ub) => ub.badgeId.toString())
    );

    // Lọc badge chưa mở khóa + phù hợp role
    const eligible = candidates.filter((badge) => {
      const badgeId = (badge._id as mongoose.Types.ObjectId).toString();
      if (unlockedSet.has(badgeId)) return false;

      if (badge.targetRole === 'BOTH') return true;
      if (badge.targetRole === 'USER' && user.role === 'USER') return true;
      if (badge.targetRole === 'STORE' && user.role === 'STORE') return true;
      return false;
    });

    if (eligible.length === 0) return;

    // Kiểm tra điều kiện và trao badge
    for (const badge of eligible) {
      const qualifies = await evaluateBadgeCondition(userId, badge as IBadge);
      if (qualifies) {
        await awardBadge(userId, badge as IBadge);
      }
    }
  } catch (err) {
    console.warn('[BadgeService] checkAndAwardBadges failed silently:', err);
  }
}

// =============================================
// III. NHÓM SERVICE DÀNH CHO ADMIN
// =============================================

/**
 * BDG_A01: Admin xem toàn bộ catalog huy hiệu kèm số lượng user đã mở khóa.
 */
export async function adminGetAllBadges(query: {
  targetRole?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
}) {
  const { targetRole, isActive, page = 1, limit = 20 } = query;

  const filter: Record<string, unknown> = {};
  if (targetRole) filter.targetRole = targetRole;
  if (typeof isActive === 'boolean') filter.isActive = isActive;

  const skip = (page - 1) * limit;

  const [badges, total] = await Promise.all([
    Badge.find(filter).sort({ sortOrder: 1 }).skip(skip).limit(limit).lean(),
    Badge.countDocuments(filter),
  ]);

  // Đếm số user đã mở khóa mỗi badge
  const badgeIds = badges.map((b) => b._id);
  const unlockCounts = await UserBadge.aggregate([
    { $match: { badgeId: { $in: badgeIds } } },
    { $group: { _id: '$badgeId', count: { $sum: 1 } } },
  ]);

  const countMap = new Map<string, number>();
  for (const item of unlockCounts) {
    countMap.set(item._id.toString(), item.count);
  }

  const enriched = badges.map((b) => ({
    ...b,
    unlockedCount: countMap.get((b._id as mongoose.Types.ObjectId).toString()) ?? 0,
  }));

  return {
    badges: enriched,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * BDG_A02: Admin tạo huy hiệu mới.
 */
export async function adminCreateBadge(data: {
  code: string;
  name: string;
  description: string;
  imageUrl: string;
  targetRole: 'USER' | 'STORE' | 'BOTH';
  triggerEvent: TriggerEvent;
  pointReward: number;
  sortOrder?: number;
}) {
  const existing = await Badge.findOne({ code: data.code.toUpperCase() });
  if (existing) {
    const err = new Error(`Badge code "${data.code}" đã tồn tại`);
    (err as Error & { statusCode?: number }).statusCode = 409;
    throw err;
  }
  return Badge.create(data);
}

/**
 * BDG_A03: Admin cập nhật huy hiệu (không cho phép đổi code/triggerEvent nếu đã có UserBadge).
 */
export async function adminUpdateBadge(
  badgeId: string,
  updates: Partial<{
    name: string;
    description: string;
    imageUrl: string;
    pointReward: number;
    sortOrder: number;
    isActive: boolean;
  }>
) {
  const badge = await Badge.findById(badgeId);
  if (!badge) {
    const err = new Error('Không tìm thấy huy hiệu');
    (err as Error & { statusCode?: number }).statusCode = 404;
    throw err;
  }

  Object.assign(badge, updates);
  return badge.save();
}

/**
 * BDG_A04: Admin bật/tắt trạng thái active của huy hiệu.
 */
export async function adminToggleBadge(badgeId: string) {
  const badge = await Badge.findById(badgeId);
  if (!badge) {
    const err = new Error('Không tìm thấy huy hiệu');
    (err as Error & { statusCode?: number }).statusCode = 404;
    throw err;
  }

  badge.isActive = !badge.isActive;
  await badge.save();
  return { isActive: badge.isActive };
}

/**
 * BDG_A05: Thống kê huy hiệu phổ biến nhất.
 */
export async function adminGetBadgeStats() {
  const totalUsers = await User.countDocuments({ role: { $ne: 'ADMIN' } });

  const stats = await UserBadge.aggregate([
    { $group: { _id: '$badgeId', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    {
      $lookup: {
        from: 'badges',
        localField: '_id',
        foreignField: '_id',
        as: 'badge',
      },
    },
    { $unwind: '$badge' },
    {
      $project: {
        _id: 0,
        badge: 1,
        unlockedCount: '$count',
        percentage: {
          $cond: [
            { $gt: [totalUsers, 0] },
            { $round: [{ $multiply: [{ $divide: ['$count', totalUsers] }, 100] }, 1] },
            0,
          ],
        },
      },
    },
  ]);

  return stats;
}

import mongoose from 'mongoose';

import User from '@/models/User';
import Post from '@/models/Post';
import Review, { IReview } from '@/models/Review';
import Voucher from '@/models/Voucher';
import Report from '@/models/Report';
import Conversation from '@/models/Conversation';
import Message from '@/models/Message';
import Transaction from '@/models/Transaction';
import SystemConfig from '@/models/SystemConfig';
import { deleteMultipleImagesByUrl } from '@/services/uploadService';
import logger from '@/utils/logger';

export class SoftDeleteError extends Error {
  public statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
  }
}

// Map tên collection → Mongoose Model
type AnyRecord = Record<string, unknown>;

const COLLECTION_MAP = {
  users: User,
  posts: Post,
  reviews: Review,
  vouchers: Voucher,
  reports: Report,
  conversations: Conversation,
  messages: Message,
} as const;

export type TrashCollection = keyof typeof COLLECTION_MAP;

const VALID_COLLECTIONS = Object.keys(COLLECTION_MAP) as TrashCollection[];

function isValidCollection(col: string): col is TrashCollection {
  return VALID_COLLECTIONS.includes(col as TrashCollection);
}

function buildSoftDeletePayload(deletedBy: string): {
  isDeleted: boolean;
  deletedAt: Date;
  deletedBy: mongoose.Types.ObjectId;
} {
  return {
    isDeleted: true,
    deletedAt: new Date(),
    deletedBy: new mongoose.Types.ObjectId(deletedBy),
  };
}

// =============================================
// SOFT DELETE — User (cascade)
// =============================================

/**
 * Soft delete user + cascade: Posts, Reviews written, Vouchers (Store), Conversations+Messages.
 * Transactions không bị xóa — giữ làm lịch sử tài chính.
 */
export async function softDeleteUser(
  userId: string,
  deletedBy: string
): Promise<void> {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new SoftDeleteError('User ID không hợp lệ', 400);
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new SoftDeleteError('Không tìm thấy người dùng', 404);
  }

  if (user.isDeleted) {
    throw new SoftDeleteError('Tài khoản này đã bị xóa', 400);
  }

  const payload = buildSoftDeletePayload(deletedBy);
  const now = payload.deletedAt;
  const deletedByOid = payload.deletedBy;

  // 1. Soft delete User
  await User.findByIdAndUpdate(userId, { $set: payload });

  // 2. Cascade: soft delete tất cả Posts của user
  await Post.updateMany(
    { ownerId: userId, isDeleted: { $ne: true } },
    { $set: { isDeleted: true, deletedAt: now, deletedBy: deletedByOid } }
  );

  // 3. Cascade: soft delete Reviews user đã viết (không xóa reviews nhận được)
  await Review.updateMany(
    { reviewerId: userId, isDeleted: { $ne: true } },
    { $set: { isDeleted: true, deletedAt: now, deletedBy: deletedByOid } }
  );

  // 4. Cascade: soft delete Vouchers của Store
  if (user.role === 'STORE') {
    await Voucher.updateMany(
      { creatorId: userId, isDeleted: { $ne: true } },
      {
        $set: {
          isDeleted: true,
          deletedAt: now,
          deletedBy: deletedByOid,
          isActive: false,
        },
      }
    );
  }

  // 5. Cascade: soft delete Conversations + Messages (chỉ cascade những conversation chưa bị xóa)
  const conversations = await Conversation.find({ participants: userId });

  if (conversations.length > 0) {
    const conversationIds = conversations.map((c) => c._id);

    await Conversation.updateMany(
      { _id: { $in: conversationIds }, isDeleted: { $ne: true } },
      { $set: { isDeleted: true, deletedAt: now, deletedBy: deletedByOid } }
    );

    await Message.updateMany(
      { conversationId: { $in: conversationIds }, isDeleted: { $ne: true } },
      { $set: { isDeleted: true, deletedAt: now, deletedBy: deletedByOid } }
    );
  }

  logger.info(`[SoftDelete] User ${userId} đã bị soft delete bởi ${deletedBy}`);
}

// =============================================
// SOFT DELETE — Post (độc lập)
// =============================================

export async function softDeletePost(
  postId: string,
  deletedBy: string,
  requestorId?: string
): Promise<void> {
  if (!mongoose.Types.ObjectId.isValid(postId)) {
    throw new SoftDeleteError('Post ID không hợp lệ', 400);
  }

  const query = requestorId
    ? Post.findOne({ _id: postId, ownerId: requestorId })
    : Post.findById(postId);

  const post = await query;

  if (!post) {
    throw new SoftDeleteError(
      requestorId
        ? 'Không tìm thấy bài đăng hoặc bạn không có quyền xóa'
        : 'Không tìm thấy bài đăng',
      404
    );
  }

  if (post.isDeleted) {
    throw new SoftDeleteError('Bài đăng này đã bị xóa', 400);
  }

  // Chặn xóa nếu còn giao dịch đang hoạt động
  const activeCount = await Transaction.countDocuments({
    postId: post._id,
    status: { $in: ['PENDING', 'ACCEPTED', 'ESCROWED', 'DISPUTED'] },
  });

  if (activeCount > 0) {
    throw new SoftDeleteError(
      `Không thể xóa bài đăng vì còn ${activeCount} giao dịch đang xử lý`,
      400
    );
  }

  await Post.findByIdAndUpdate(postId, { $set: buildSoftDeletePayload(deletedBy) });
}

// =============================================
// SOFT DELETE — Review (độc lập + recalc rating)
// =============================================

export async function softDeleteReview(
  reviewId: string,
  deletedBy: string,
  requestorId?: string
): Promise<void> {
  if (!mongoose.Types.ObjectId.isValid(reviewId)) {
    throw new SoftDeleteError('Review ID không hợp lệ', 400);
  }

  const review = await Review.findById(reviewId);

  if (!review) {
    throw new SoftDeleteError('Không tìm thấy đánh giá', 404);
  }

  if (requestorId && review.reviewerId.toString() !== requestorId) {
    throw new SoftDeleteError('Bạn không có quyền xóa đánh giá này', 403);
  }

  if (review.isDeleted) {
    throw new SoftDeleteError('Đánh giá này đã bị xóa', 400);
  }

  const revieweeId = review.revieweeId.toString();

  await Review.findByIdAndUpdate(reviewId, { $set: buildSoftDeletePayload(deletedBy) });

  // Tính lại averageRating — không tính review vừa bị xóa
  await recalculateAverageRatingExcluding(revieweeId, reviewId);
}

// Helper: tính lại averageRating sau khi soft delete (aggregate phải filter isDeleted)
async function recalculateAverageRatingExcluding(
  revieweeId: string,
  excludeReviewId?: string
): Promise<void> {
  const matchStage: Record<string, unknown> = {
    revieweeId: new mongoose.Types.ObjectId(revieweeId),
    isDeleted: { $ne: true },
  };

  if (excludeReviewId) {
    matchStage._id = { $ne: new mongoose.Types.ObjectId(excludeReviewId) };
  }

  const result = await Review.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        averageRating: { $avg: '$rating' },
      },
    },
  ]);

  const newAverage = result.length > 0 ? Math.round(result[0].averageRating * 10) / 10 : 5.0;

  await User.findByIdAndUpdate(revieweeId, { averageRating: newAverage });
}

// =============================================
// SOFT DELETE — Voucher (độc lập + deactivate)
// =============================================

export async function softDeleteVoucher(
  voucherId: string,
  deletedBy: string,
  requestorId?: string
): Promise<void> {
  if (!mongoose.Types.ObjectId.isValid(voucherId)) {
    throw new SoftDeleteError('Voucher ID không hợp lệ', 400);
  }

  const query = requestorId
    ? Voucher.findOne({ _id: voucherId, creatorId: requestorId })
    : Voucher.findById(voucherId);

  const voucher = await query;

  if (!voucher) {
    throw new SoftDeleteError(
      requestorId
        ? 'Không tìm thấy voucher hoặc bạn không có quyền xóa'
        : 'Không tìm thấy voucher',
      404
    );
  }

  if (voucher.isDeleted) {
    throw new SoftDeleteError('Voucher này đã bị xóa', 400);
  }

  await Voucher.findByIdAndUpdate(voucherId, {
    $set: { ...buildSoftDeletePayload(deletedBy), isActive: false },
  });
}

// =============================================
// SOFT DELETE — Conversation (cascade Messages)
// =============================================

export async function softDeleteConversation(
  conversationId: string,
  deletedBy: string,
  requestorId?: string
): Promise<void> {
  if (!mongoose.Types.ObjectId.isValid(conversationId)) {
    throw new SoftDeleteError('Conversation ID không hợp lệ', 400);
  }

  const conversation = await Conversation.findById(conversationId);

  if (!conversation) {
    throw new SoftDeleteError('Không tìm thấy cuộc trò chuyện', 404);
  }

  if (
    requestorId &&
    !conversation.participants.map((p) => p.toString()).includes(requestorId)
  ) {
    throw new SoftDeleteError('Bạn không phải thành viên của cuộc trò chuyện này', 403);
  }

  if (conversation.isDeleted) {
    throw new SoftDeleteError('Cuộc trò chuyện này đã bị xóa', 400);
  }

  const payload = buildSoftDeletePayload(deletedBy);

  await Conversation.findByIdAndUpdate(conversationId, { $set: payload });

  // Cascade: soft delete tất cả Messages trong conversation
  await Message.updateMany(
    { conversationId, isDeleted: { $ne: true } },
    {
      $set: {
        isDeleted: true,
        deletedAt: payload.deletedAt,
        deletedBy: payload.deletedBy,
      },
    }
  );
}

// =============================================
// RESTORE — Generic (Admin only)
// =============================================

export async function restoreItem(
  collection: string,
  itemId: string
): Promise<Record<string, unknown>> {
  if (!isValidCollection(collection)) {
    throw new SoftDeleteError(
      `Collection không hợp lệ. Hợp lệ: ${VALID_COLLECTIONS.join(', ')}`,
      400
    );
  }

  if (!mongoose.Types.ObjectId.isValid(itemId)) {
    throw new SoftDeleteError('ID không hợp lệ', 400);
  }

  const Model = COLLECTION_MAP[collection] as any;
  const item = await Model.findOne({ _id: itemId, isDeleted: true });

  if (!item) {
    throw new SoftDeleteError('Không tìm thấy dữ liệu trong thùng rác', 404);
  }

  // updateOne bypasses the pre(/^find/) plugin hook — findByIdAndUpdate would add
  // { isDeleted: { $ne: true } } to its own filter, preventing the update from matching.
  await Model.updateOne(
    { _id: new mongoose.Types.ObjectId(itemId) },
    { $set: { isDeleted: false }, $unset: { deletedAt: '', deletedBy: '' } }
  );

  logger.info(`[SoftDelete] Restored ${collection}/${itemId}`);

  const restored = await Model.findById(itemId).lean();
  return (restored ?? {}) as Record<string, unknown>;
}

// =============================================
// PURGE — Permanent delete (Admin only)
// =============================================

export async function purgeItem(collection: string, itemId: string): Promise<void> {
  if (!isValidCollection(collection)) {
    throw new SoftDeleteError(
      `Collection không hợp lệ. Hợp lệ: ${VALID_COLLECTIONS.join(', ')}`,
      400
    );
  }

  if (!mongoose.Types.ObjectId.isValid(itemId)) {
    throw new SoftDeleteError('ID không hợp lệ', 400);
  }

  const Model = COLLECTION_MAP[collection] as any;
  const item = await Model.findOne({ _id: itemId, isDeleted: true });

  if (!item) {
    throw new SoftDeleteError('Không tìm thấy dữ liệu', 404);
  }

  // Cleanup Cloudinary ảnh của Post
  if (collection === 'posts') {
    if (item.images?.length > 0) {
      deleteMultipleImagesByUrl(item.images).catch(() => {});
    }
  }

  await Model.findByIdAndDelete(itemId);

  logger.info(`[SoftDelete] Purged ${collection}/${itemId}`);
}

// =============================================
// GET TRASH ITEMS (Admin only)
// =============================================

export interface TrashFilter {
  collection?: TrashCollection;
  page?: number;
  limit?: number;
  from?: Date;
  to?: Date;
}

export interface TrashResult {
  collection: string;
  data: unknown[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export async function getTrashItems(filters: TrashFilter): Promise<TrashResult[]> {
  const { collection, page = 1, limit = 20, from, to } = filters;

  const dateFilter: Record<string, unknown> = {};
  if (from || to) {
    dateFilter.deletedAt = {};
    if (from) (dateFilter.deletedAt as any).$gte = from;
    if (to) (dateFilter.deletedAt as any).$lte = to;
  }

  const baseFilter = { isDeleted: true, ...dateFilter };
  const skip = (page - 1) * limit;

  const collectionsToQuery: TrashCollection[] = collection
    ? [collection]
    : VALID_COLLECTIONS;

  // Mongoose populate's `match` is applied post-fetch, not merged into the _id lookup,
  // so the softDeletePlugin's pre(/^find/) hook still strips isDeleted:true users.
  // Instead: fetch lean items first, then do a separate User query with isDeleted in the
  // filter directly — the plugin sees `isDeleted` in the filter and skips its own rule.
  const fetchUsersById = async (
    ids: (mongoose.Types.ObjectId | string)[],
    fields: string
  ): Promise<Map<string, AnyRecord>> => {
    if (ids.length === 0) return new Map();
    const unique = [...new Set(ids.map((id) => id.toString()))];
    const users = await User.find(
      { _id: { $in: unique }, isDeleted: { $in: [true, false] } },
      fields
    ).lean();
    return new Map((users as unknown as AnyRecord[]).map((u) => [(u._id as any).toString(), u]));
  };

  const results: TrashResult[] = await Promise.all(
    collectionsToQuery.map(async (col) => {
      const Model = COLLECTION_MAP[col] as any;

      const [rawData, total] = await Promise.all([
        Model.find(baseFilter).sort({ deletedAt: -1 }).skip(skip).limit(limit).lean(),
        Model.countDocuments(baseFilter),
      ]);

      // Manual user-field injection per collection
      let data = rawData as AnyRecord[];

      if (col === 'posts' && data.length > 0) {
        const ownerIds = data.map((p) => p.ownerId).filter(Boolean) as mongoose.Types.ObjectId[];
        const ownerMap = await fetchUsersById(ownerIds, 'fullName avatar email');
        data = data.map((p) => ({
          ...p,
          ownerId: ownerMap.get((p.ownerId as any)?.toString()) ?? p.ownerId,
        }));
      } else if (col === 'reviews' && data.length > 0) {
        const ids = [
          ...data.map((r) => r.reviewerId),
          ...data.map((r) => r.revieweeId),
        ].filter(Boolean) as mongoose.Types.ObjectId[];
        const userMap = await fetchUsersById(ids, 'fullName avatar email');
        data = data.map((r) => ({
          ...r,
          reviewerId: userMap.get((r.reviewerId as any)?.toString()) ?? r.reviewerId,
          revieweeId: userMap.get((r.revieweeId as any)?.toString()) ?? r.revieweeId,
        }));
      } else if (col === 'vouchers' && data.length > 0) {
        const creatorIds = data.map((v) => v.creatorId).filter(Boolean) as mongoose.Types.ObjectId[];
        const creatorMap = await fetchUsersById(creatorIds, 'fullName avatar email');
        data = data.map((v) => ({
          ...v,
          creatorId: creatorMap.get((v.creatorId as any)?.toString()) ?? v.creatorId,
        }));
      } else if (col === 'conversations' && data.length > 0) {
        const allParticipantIds = (data.flatMap((c) => c.participants as mongoose.Types.ObjectId[]) ?? []).filter(Boolean);
        const participantMap = await fetchUsersById(allParticipantIds, 'fullName avatar email');
        data = data.map((c) => ({
          ...c,
          participants: ((c.participants as any[]) ?? []).map(
            (id: any) => participantMap.get(id?.toString()) ?? id
          ),
        }));
      }

      return {
        collection: col,
        data,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    })
  );

  return results;
}

// =============================================
// CLEANUP — Auto-purge items past grace period
// =============================================

export interface CleanupResult {
  collection: string;
  purgedCount: number;
}

export async function runCleanup(gracePeriodDays: number): Promise<CleanupResult[]> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - gracePeriodDays);

  const expiredFilter = {
    isDeleted: true,
    deletedAt: { $lte: cutoffDate },
  };

  const results: CleanupResult[] = [];

  for (const col of VALID_COLLECTIONS) {
    try {
      const Model = COLLECTION_MAP[col];

      // Xử lý đặc biệt: xóa ảnh Cloudinary của Posts trước khi purge
      if (col === 'posts') {
        const expiredPosts = await Post.find(expiredFilter as any)
          .select('images')
          .lean();

        for (const post of expiredPosts) {
          if ((post as any).images?.length > 0) {
            deleteMultipleImagesByUrl((post as any).images).catch(() => {});
          }
        }
      }

      const deleteResult = await (Model as any).deleteMany(expiredFilter);
      const purgedCount: number = deleteResult.deletedCount ?? 0;

      results.push({ collection: col, purgedCount });

      if (purgedCount > 0) {
        logger.info(`[Cleanup] Purged ${purgedCount} ${col}`);
      }
    } catch (err) {
      logger.error(`[Cleanup] Failed to purge ${col}:`, err);
      results.push({ collection: col, purgedCount: 0 });
    }
  }

  // Cập nhật lastCleanupAt và lastCleanupCount trong SystemConfig
  const totalPurged = results.reduce((sum, r) => sum + r.purgedCount, 0);
  await SystemConfig.findOneAndUpdate(
    {},
    {
      $set: {
        'softDelete.lastCleanupAt': new Date(),
        'softDelete.lastCleanupCount': totalPurged,
      },
    }
  );

  logger.info(`[Cleanup] Done — total purged: ${totalPurged}`);
  return results;
}

// =============================================
// PURGE ALL — Force purge tất cả items trong trash (bỏ qua grace period)
// =============================================

export async function purgeAllNow(): Promise<CleanupResult[]> {
  const allDeletedFilter = { isDeleted: true };
  const results: CleanupResult[] = [];

  for (const col of VALID_COLLECTIONS) {
    try {
      const Model = COLLECTION_MAP[col];

      if (col === 'posts') {
        const deletedPosts = await Post.find(allDeletedFilter as any).select('images').lean();
        for (const post of deletedPosts) {
          if ((post as any).images?.length > 0) {
            deleteMultipleImagesByUrl((post as any).images).catch(() => {});
          }
        }
      }

      const deleteResult = await (Model as any).deleteMany(allDeletedFilter);
      const purgedCount: number = deleteResult.deletedCount ?? 0;
      results.push({ collection: col, purgedCount });

      if (purgedCount > 0) {
        logger.info(`[PurgeAll] Purged ${purgedCount} ${col}`);
      }
    } catch (err) {
      logger.error(`[PurgeAll] Failed to purge ${col}:`, err);
      results.push({ collection: col, purgedCount: 0 });
    }
  }

  const totalPurged = results.reduce((sum, r) => sum + r.purgedCount, 0);
  await SystemConfig.findOneAndUpdate(
    {},
    {
      $set: {
        'softDelete.lastCleanupAt': new Date(),
        'softDelete.lastCleanupCount': totalPurged,
      },
    }
  );

  logger.info(`[PurgeAll] Done — total purged: ${totalPurged}`);
  return results;
}

// =============================================
// RESTORE USER WITH ASSOCIATED DATA (Admin only)
// =============================================

export async function restoreUserWithAssociated(
  userId: string,
  restoreAssociated = false
): Promise<void> {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new SoftDeleteError('User ID không hợp lệ', 400);
  }

  const user = await User.findOne({ _id: userId, isDeleted: true });
  if (!user) {
    throw new SoftDeleteError('Không tìm thấy người dùng trong thùng rác', 404);
  }

  // Restore user
  await User.findByIdAndUpdate(userId, {
    $set: { isDeleted: false },
    $unset: { deletedAt: '', deletedBy: '' },
  });

  logger.info(`[Restore] Restored user/${userId}`);

  if (restoreAssociated) {
    const userObjectId = new mongoose.Types.ObjectId(userId);

    // Restore Posts của user
    await Post.updateMany(
      { ownerId: userObjectId, isDeleted: true },
      { $set: { isDeleted: false }, $unset: { deletedAt: '', deletedBy: '' } }
    );

    // Restore Reviews đã viết
    await Review.updateMany(
      { reviewerId: userObjectId, isDeleted: true },
      { $set: { isDeleted: false }, $unset: { deletedAt: '', deletedBy: '' } }
    );

    // Restore Conversations
    const conversations = await Conversation.find({
      participants: userObjectId,
      isDeleted: true,
    }).select('_id');

    if (conversations.length > 0) {
      const convIds = conversations.map((c) => c._id);
      await Conversation.updateMany(
        { _id: { $in: convIds } },
        { $set: { isDeleted: false }, $unset: { deletedAt: '', deletedBy: '' } }
      );
      await Message.updateMany(
        { conversationId: { $in: convIds }, isDeleted: true },
        { $set: { isDeleted: false }, $unset: { deletedAt: '', deletedBy: '' } }
      );
    }

    // Restore Vouchers (nếu là Store)
    if (user.role === 'STORE') {
      await Voucher.updateMany(
        { creatorId: userObjectId, isDeleted: true },
        { $set: { isDeleted: false }, $unset: { deletedAt: '', deletedBy: '' } }
      );
    }

    logger.info(`[Restore] Restored all associated data for user/${userId}`);
  }
}

// =============================================
// SOFT DELETE — Report (Admin override)
// =============================================

export async function softDeleteReport(
  reportId: string,
  deletedBy: string
): Promise<void> {
  if (!mongoose.Types.ObjectId.isValid(reportId)) {
    throw new SoftDeleteError('Report ID không hợp lệ', 400);
  }

  const report = await Report.findById(reportId);
  if (!report) {
    throw new SoftDeleteError('Không tìm thấy báo cáo', 404);
  }

  if (report.isDeleted) {
    throw new SoftDeleteError('Báo cáo này đã bị xóa', 400);
  }

  await Report.findByIdAndUpdate(reportId, { $set: buildSoftDeletePayload(deletedBy) });
}

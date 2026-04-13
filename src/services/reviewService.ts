import mongoose from 'mongoose';

import Review, { IReview } from '@/models/Review';
import User from '@/models/User';
import Transaction from '@/models/Transaction';
import PointLog from '@/models/PointLog';
import { checkAndAwardBadges } from '@/services/badgeService';

// Hằng số
const REVIEW_REWARD_POINTS = 2;
const LOW_RATING_WARNING_THRESHOLD = 3.0;
const LOW_RATING_BAN_THRESHOLD = 2.0;

export class ReviewServiceError extends Error {
  public statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
  }
}

// =============================================
// HELPER: Tính toán lại averageRating cho user
// =============================================

/**
 * Tính toán lại điểm trung bình từ TẤT CẢ review mà user nhận được.
 * Nếu không còn review nào → reset về 5.0 (mặc định)
 */
export async function recalculateAverageRating(
  revieweeId: string
): Promise<number> {
  const result = await Review.aggregate([
    { $match: { revieweeId: new mongoose.Types.ObjectId(revieweeId) } },
    {
      $group: {
        _id: null,
        averageRating: { $avg: '$rating' },
        count: { $sum: 1 },
      },
    },
  ]);

  const newAverage = result.length > 0 ? result[0].averageRating : 5.0;
  const roundedAverage = Math.round(newAverage * 10) / 10;

  await User.findByIdAndUpdate(revieweeId, {
    averageRating: roundedAverage,
  });

  return roundedAverage;
}

// =============================================
// I. NHÓM SERVICE DÀNH CHO USER / STORE
// =============================================

interface CreateReviewInput {
  transactionId: string;
  rating: number;
  feedback?: string;
}

/**
 * REV_F01: Tạo đánh giá cho giao dịch đã hoàn tất.
 */
export async function createReview(
  reviewerId: string,
  data: CreateReviewInput
): Promise<IReview> {
  const { transactionId, rating, feedback } = data;

  if (!mongoose.Types.ObjectId.isValid(transactionId)) {
    throw new ReviewServiceError('Transaction ID không hợp lệ', 400);
  }

  // Tìm transaction COMPLETED
  const transaction = await Transaction.findById(transactionId);
  if (!transaction) {
    throw new ReviewServiceError('Không tìm thấy giao dịch', 404);
  }

  if (transaction.status !== 'COMPLETED') {
    throw new ReviewServiceError(
      'Chỉ có thể đánh giá giao dịch đã hoàn tất (COMPLETED)',
      400
    );
  }

  // Kiểm tra reviewer có tham gia giao dịch không
  const isRequester = transaction.requesterId.toString() === reviewerId;
  const isOwner = transaction.ownerId.toString() === reviewerId;

  if (!isRequester && !isOwner) {
    throw new ReviewServiceError(
      'Bạn không có quyền đánh giá giao dịch mà mình không tham gia',
      403
    );
  }

  // Xác định revieweeId (người bị đánh giá)
  const revieweeId = isRequester
    ? transaction.ownerId.toString()
    : transaction.requesterId.toString();

  // Ngăn chặn self-review (phòng ngừa edge case)
  if (revieweeId === reviewerId) {
    throw new ReviewServiceError('Bạn không thể tự đánh giá bản thân', 400);
  }

  // Tạo bản ghi Review (unique index sẽ tự chặn nếu đã đánh giá)
  let review: IReview;
  try {
    review = await Review.create({
      transactionId,
      reviewerId,
      revieweeId,
      rating,
      feedback: feedback || '',
    });
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      'code' in error &&
      (error as { code: number }).code === 11000
    ) {
      throw new ReviewServiceError('Bạn đã đánh giá giao dịch này rồi', 409);
    }
    throw error;
  }

  // Tính toán lại averageRating cho reviewee
  const newAverage = await recalculateAverageRating(revieweeId);

  // Cảnh báo nếu rating tụt dưới ngưỡng
  if (newAverage < LOW_RATING_BAN_THRESHOLD) {
    // TODO: Gửi Push Notification / Email cảnh báo khóa tài khoản
    console.warn(
      `⚠️ User ${revieweeId} có averageRating ${newAverage} < ${LOW_RATING_BAN_THRESHOLD} → Cần xem xét khóa`
    );
  } else if (newAverage < LOW_RATING_WARNING_THRESHOLD) {
    // TODO: Gửi Push Notification cảnh báo nhẹ
    console.warn(
      `⚠️ User ${revieweeId} có averageRating ${newAverage} < ${LOW_RATING_WARNING_THRESHOLD} → Cảnh báo`
    );
  }

  // Cộng thưởng GreenPoints cho reviewer vì đã để lại đánh giá
  await User.findByIdAndUpdate(reviewerId, {
    $inc: { greenPoints: REVIEW_REWARD_POINTS },
  });
  await PointLog.create({
    userId: reviewerId,
    amount: REVIEW_REWARD_POINTS,
    reason: 'Thưởng điểm vì đã để lại đánh giá giao dịch',
    referenceId: new mongoose.Types.ObjectId(transactionId),
  });

  // Trigger REVIEW_RECEIVED badge check cho người bị đánh giá
  try {
    await checkAndAwardBadges(revieweeId, 'REVIEW_RECEIVED');
  } catch (err) {
    console.warn('[ReviewService] badge check (REVIEW_RECEIVED) failed:', err);
  }

  return review;
}

interface GetReviewsQuery {
  page?: number;
  limit?: number;
  sort?: string;
}

interface PaginatedReviewResult {
  data: IReview[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * REV_F02: Xem danh sách đánh giá mà một User đã nhận được.
 */
export async function getUserReviews(
  userId: string,
  query: GetReviewsQuery
): Promise<PaginatedReviewResult> {
  const { page = 1, limit = 20, sort } = query;

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new ReviewServiceError('User ID không hợp lệ', 400);
  }

  // Loại trừ self-review để tránh người dùng thấy thông tin của chính mình
  const filter: Record<string, unknown> = {
    revieweeId: new mongoose.Types.ObjectId(userId),
    reviewerId: { $ne: new mongoose.Types.ObjectId(userId) },
  };

  // Lọc theo rating cụ thể nếu sort là số từ 1-5
  const ratingFilter = Number(sort);
  if (ratingFilter >= 1 && ratingFilter <= 5) {
    filter.rating = ratingFilter;
  }

  const skip = (page - 1) * limit;

  const [reviews, total] = await Promise.all([
    Review.find(filter)
      .populate('reviewerId', 'fullName avatar')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Review.countDocuments(filter),
  ]);

  return {
    data: reviews as IReview[],
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Xem danh sách đánh giá do user viết cho người khác.
 */
export async function getMyWrittenReviews(
  reviewerId: string,
  query: GetReviewsQuery
): Promise<PaginatedReviewResult> {
  const { page = 1, limit = 20 } = query;

  const skip = (page - 1) * limit;

  const [reviews, total] = await Promise.all([
    Review.find({ reviewerId })
      .populate('revieweeId', 'fullName avatar')
      .populate('transactionId', 'postId type quantity status')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Review.countDocuments({ reviewerId }),
  ]);

  return {
    data: reviews as IReview[],
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Sửa đánh giá của mình (rating + feedback).
 */
export async function updateMyReview(
  reviewerId: string,
  reviewId: string,
  data: { rating: number; feedback?: string }
): Promise<IReview> {
  if (!mongoose.Types.ObjectId.isValid(reviewId)) {
    throw new ReviewServiceError('Review ID không hợp lệ', 400);
  }

  const review = await Review.findById(reviewId);
  if (!review) {
    throw new ReviewServiceError('Không tìm thấy bài đánh giá', 404);
  }

  if (review.reviewerId.toString() !== reviewerId) {
    throw new ReviewServiceError(
      'Bạn không có quyền chỉnh sửa đánh giá này',
      403
    );
  }

  review.rating = data.rating;
  if (data.feedback !== undefined) {
    review.feedback = data.feedback;
  }
  await review.save();

  // BẮT BUỘC tính toán lại averageRating cho reviewee
  await recalculateAverageRating(review.revieweeId.toString());

  return review;
}

/**
 * Xóa (rút lại) đánh giá của mình.
 */
export async function deleteMyReview(
  reviewerId: string,
  reviewId: string
): Promise<void> {
  if (!mongoose.Types.ObjectId.isValid(reviewId)) {
    throw new ReviewServiceError('Review ID không hợp lệ', 400);
  }

  const review = await Review.findById(reviewId);
  if (!review) {
    throw new ReviewServiceError('Không tìm thấy bài đánh giá', 404);
  }

  if (review.reviewerId.toString() !== reviewerId) {
    throw new ReviewServiceError('Bạn không có quyền xóa đánh giá này', 403);
  }

  const revieweeId = review.revieweeId.toString();

  await review.deleteOne();

  // BẮT BUỘC tính toán lại averageRating sau khi xóa
  await recalculateAverageRating(revieweeId);
}

// =============================================
// II. NHÓM SERVICE DÀNH CHO ADMIN
// =============================================

interface AdminGetReviewsQuery {
  rating?: number;
  revieweeId?: string;
  page?: number;
  limit?: number;
}

/**
 * Admin xem toàn bộ đánh giá trên hệ thống + lọc.
 */
export async function adminGetReviews(
  query: AdminGetReviewsQuery
): Promise<PaginatedReviewResult> {
  const { rating, revieweeId, page = 1, limit = 20 } = query;

  const filter: Record<string, unknown> = {};
  if (rating) filter.rating = rating;
  if (revieweeId) {
    if (!mongoose.Types.ObjectId.isValid(revieweeId)) {
      throw new ReviewServiceError('revieweeId không hợp lệ', 400);
    }
    filter.revieweeId = revieweeId;
  }

  const skip = (page - 1) * limit;

  const [reviews, total] = await Promise.all([
    Review.find(filter)
      .populate('reviewerId', 'fullName email avatar')
      .populate('revieweeId', 'fullName email avatar')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Review.countDocuments(filter),
  ]);

  return {
    data: reviews as IReview[],
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Admin xóa bỏ đánh giá ác ý + phục hồi averageRating cho người bị đánh giá.
 */
export async function adminDeleteReview(
  reviewId: string
): Promise<{ deletedRevieweeId: string; newAverageRating: number }> {
  if (!mongoose.Types.ObjectId.isValid(reviewId)) {
    throw new ReviewServiceError('Review ID không hợp lệ', 400);
  }

  const review = await Review.findById(reviewId);
  if (!review) {
    throw new ReviewServiceError('Không tìm thấy bài đánh giá', 404);
  }

  const revieweeId = review.revieweeId.toString();

  // Xóa cứng bài review
  await review.deleteOne();

  // Phục hồi nhân phẩm: Tính toán lại averageRating
  const newAverageRating = await recalculateAverageRating(revieweeId);

  return { deletedRevieweeId: revieweeId, newAverageRating };
}

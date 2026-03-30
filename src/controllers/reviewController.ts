import { Request, Response } from 'express';

import {
  ReviewServiceError,
  createReview as createReviewService,
  getUserReviews as getUserReviewsService,
  getMyWrittenReviews as getMyWrittenReviewsService,
  updateMyReview as updateMyReviewService,
  deleteMyReview as deleteMyReviewService,
  adminGetReviews as adminGetReviewsService,
  adminDeleteReview as adminDeleteReviewService,
} from '@/services/reviewService';

function handleReviewError(error: unknown, res: Response): void {
  if (error instanceof ReviewServiceError) {
    res.status(error.statusCode).json({
      success: false,
      message: error.message,
    });
    return;
  }

  const message = error instanceof Error ? error.message : 'Lỗi không xác định';
  console.error('❌ Review Error:', message);
  res.status(500).json({
    success: false,
    message: 'Đã xảy ra lỗi từ phía server',
  });
}

// =============================================
// I. NHÓM HANDLER DÀNH CHO USER / STORE
// =============================================

/**
 * [POST] /api/reviews
 * Đánh giá giao dịch đã hoàn tất.
 */
export const createReview = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const reviewerId = req.user?.id;
    if (!reviewerId) {
      res.status(401).json({
        success: false,
        message: 'Bạn cần đăng nhập để thực hiện thao tác này',
      });
      return;
    }

    const { transactionId, rating, feedback } = req.body;

    const review = await createReviewService(reviewerId, {
      transactionId,
      rating,
      feedback,
    });

    res.status(201).json({
      success: true,
      message: 'Đánh giá giao dịch thành công',
      data: review,
    });
  } catch (error) {
    handleReviewError(error, res);
  }
};

/**
 * [GET] /api/reviews/users/:userId
 * Xem danh sách đánh giá mà một User đã nhận được.
 */
export const getUserReviews = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = Array.isArray(req.params.userId)
      ? req.params.userId[0]
      : req.params.userId;

    const { page, limit, sort } = req.query;

    const result = await getUserReviewsService(userId, {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      sort: sort as string | undefined,
    });

    res.status(200).json({
      success: true,
      data: result.data,
      pagination: result.pagination,
    });
  } catch (error) {
    handleReviewError(error, res);
  }
};

/**
 * [GET] /api/reviews/me
 * Xem danh sách đánh giá do bản thân viết cho người khác.
 */
export const getMyWrittenReviews = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const reviewerId = req.user?.id;
    if (!reviewerId) {
      res.status(401).json({
        success: false,
        message: 'Bạn cần đăng nhập để thực hiện thao tác này',
      });
      return;
    }

    const { page, limit } = req.query;

    const result = await getMyWrittenReviewsService(reviewerId, {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });

    res.status(200).json({
      success: true,
      data: result.data,
      pagination: result.pagination,
    });
  } catch (error) {
    handleReviewError(error, res);
  }
};

/**
 * [PUT] /api/reviews/:reviewId
 * Chỉnh sửa đánh giá của bản thân.
 */
export const updateMyReview = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const reviewerId = req.user?.id;
    if (!reviewerId) {
      res.status(401).json({
        success: false,
        message: 'Bạn cần đăng nhập để thực hiện thao tác này',
      });
      return;
    }

    const reviewId = Array.isArray(req.params.reviewId)
      ? req.params.reviewId[0]
      : req.params.reviewId;

    const { rating, feedback } = req.body;

    const review = await updateMyReviewService(reviewerId, reviewId, {
      rating,
      feedback,
    });

    res.status(200).json({
      success: true,
      message: 'Cập nhật đánh giá thành công',
      data: review,
    });
  } catch (error) {
    handleReviewError(error, res);
  }
};

/**
 * [DELETE] /api/reviews/:reviewId
 * Rút lại đánh giá của bản thân.
 */
export const deleteMyReview = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const reviewerId = req.user?.id;
    if (!reviewerId) {
      res.status(401).json({
        success: false,
        message: 'Bạn cần đăng nhập để thực hiện thao tác này',
      });
      return;
    }

    const reviewId = Array.isArray(req.params.reviewId)
      ? req.params.reviewId[0]
      : req.params.reviewId;

    await deleteMyReviewService(reviewerId, reviewId);

    res.status(200).json({
      success: true,
      message: 'Xóa đánh giá thành công',
    });
  } catch (error) {
    handleReviewError(error, res);
  }
};

// =============================================
// II. NHÓM HANDLER DÀNH CHO ADMIN
// =============================================

/**
 * [GET] /api/reviews/admin
 * Admin xem toàn bộ đánh giá trên hệ thống + lọc.
 */
export const adminGetReviews = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { rating, revieweeId, page, limit } = req.query;

    const result = await adminGetReviewsService({
      rating: rating ? Number(rating) : undefined,
      revieweeId: revieweeId as string | undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });

    res.status(200).json({
      success: true,
      data: result.data,
      pagination: result.pagination,
    });
  } catch (error) {
    handleReviewError(error, res);
  }
};

/**
 * [DELETE] /api/reviews/admin/:reviewId
 * Admin xóa đánh giá ác ý + phục hồi averageRating.
 */
export const adminDeleteReview = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const reviewId = Array.isArray(req.params.reviewId)
      ? req.params.reviewId[0]
      : req.params.reviewId;

    const result = await adminDeleteReviewService(reviewId);

    res.status(200).json({
      success: true,
      message: 'Đã xóa đánh giá và cập nhật điểm trung bình thành công',
      data: {
        revieweeId: result.deletedRevieweeId,
        newAverageRating: result.newAverageRating,
      },
    });
  } catch (error) {
    handleReviewError(error, res);
  }
};

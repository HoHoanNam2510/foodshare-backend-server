import { Router } from 'express';
import {
  createReview,
  getUserReviews,
  getMyWrittenReviews,
  updateMyReview,
  deleteMyReview,
  adminGetReviews,
  adminDeleteReview,
} from '../controllers/reviewController';
import { verifyAuth, verifyAdmin } from '../middlewares/authMiddleware';
import { validateBody } from '../middlewares/validateBodyMiddleware';
import {
  createReviewSchema,
  updateReviewSchema,
} from '../validations/reviewValidation';

const router = Router();

// =============================================
// NHÓM ADMIN (yêu cầu đăng nhập + quyền Admin)
// Đặt trước các route user để tránh bị catch bởi param route
// =============================================

// [GET] /api/reviews/admin
// (Danh sách đánh giá toàn hệ thống + lọc + phân trang)
router.get('/admin', verifyAuth, verifyAdmin, adminGetReviews);

// [DELETE] /api/reviews/admin/:reviewId
// (Admin xóa đánh giá ác ý + phục hồi averageRating)
router.delete('/admin/:reviewId', verifyAuth, verifyAdmin, adminDeleteReview);

// =============================================
// NHÓM USER / STORE (yêu cầu đăng nhập)
// =============================================

// [POST] /api/reviews
// (Đánh giá giao dịch đã hoàn tất)
router.post('/', verifyAuth, validateBody(createReviewSchema), createReview);

// [GET] /api/reviews/me
// (Xem danh sách đánh giá do bản thân viết)
router.get('/me', verifyAuth, getMyWrittenReviews);

// [GET] /api/reviews/users/:userId
// (Xem danh sách đánh giá mà một User đã nhận được)
router.get('/users/:userId', getUserReviews);

// [PUT] /api/reviews/:reviewId
// (Chỉnh sửa đánh giá của bản thân)
router.put(
  '/:reviewId',
  verifyAuth,
  validateBody(updateReviewSchema),
  updateMyReview
);

// [DELETE] /api/reviews/:reviewId
// (Rút lại đánh giá của bản thân)
router.delete('/:reviewId', verifyAuth, deleteMyReview);

export default router;

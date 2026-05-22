import { Router } from 'express';
import {
  createFeedback,
  getMyFeedbacks,
  adminGetFeedbacks,
  adminGetFeedbackDetail,
  adminAssignFeedback,
  adminResolveFeedback,
} from '../controllers/feedbackController';
import { verifyAuth, verifyAdmin } from '../middlewares/authMiddleware';
import { validateBody } from '../middlewares/validateBodyMiddleware';
import { validateQuery } from '../middlewares/validateRequestMiddleware';
import {
  createFeedbackSchema,
  adminResolveFeedbackSchema,
  getFeedbacksQuerySchema,
} from '../validations/feedbackValidation';

const router = Router();

// =============================================
// NHÓM ADMIN (yêu cầu đăng nhập + quyền Admin)
// Đặt trước các route user để tránh bị catch bởi param route
// =============================================

// [GET] /api/feedbacks/admin
router.get(
  '/admin',
  verifyAuth,
  verifyAdmin,
  validateQuery(getFeedbacksQuerySchema),
  adminGetFeedbacks
);

// [GET] /api/feedbacks/admin/:id
router.get('/admin/:id', verifyAuth, verifyAdmin, adminGetFeedbackDetail);

// [PATCH] /api/feedbacks/admin/:id/assign
router.patch('/admin/:id/assign', verifyAuth, verifyAdmin, adminAssignFeedback);

// [PATCH] /api/feedbacks/admin/:id/resolve
router.patch(
  '/admin/:id/resolve',
  verifyAuth,
  verifyAdmin,
  validateBody(adminResolveFeedbackSchema),
  adminResolveFeedback
);

// =============================================
// NHÓM USER / STORE (yêu cầu đăng nhập)
// =============================================

// [POST] /api/feedbacks
router.post(
  '/',
  verifyAuth,
  validateBody(createFeedbackSchema),
  createFeedback
);

// [GET] /api/feedbacks/me
router.get('/me', verifyAuth, getMyFeedbacks);

export default router;

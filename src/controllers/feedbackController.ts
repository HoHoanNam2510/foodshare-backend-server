import { Request, Response } from 'express';
import {
  FeedbackServiceError,
  createFeedback as createFeedbackService,
  getMyFeedbacks as getMyFeedbacksService,
  adminGetFeedbacks as adminGetFeedbacksService,
  adminGetFeedbackDetail as adminGetFeedbackDetailService,
  adminAssignFeedback as adminAssignFeedbackService,
  adminResolveFeedback as adminResolveFeedbackService,
} from '@/services/feedbackService';
import {
  FeedbackStatus,
  FeedbackType,
  FeedbackPriority,
} from '@/models/Feedback';
import logger from '@/utils/logger';

function handleFeedbackError(error: unknown, res: Response): void {
  if (error instanceof FeedbackServiceError) {
    res.status(error.statusCode).json({
      success: false,
      message: error.message,
    });
    return;
  }

  const message = error instanceof Error ? error.message : 'Lỗi không xác định';
  logger.error('❌ Feedback Error:', message);
  res.status(500).json({
    success: false,
    message: 'Đã xảy ra lỗi từ phía server',
  });
}

// =============================================
// I. NHÓM HANDLER DÀNH CHO USER / STORE
// =============================================

export const createFeedback = async (
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

    const userRole = req.user?.role ?? 'USER';
    const { type, title, content, attachments, contextMetadata } = req.body;

    const feedback = await createFeedbackService(userId, userRole, {
      type,
      title,
      content,
      attachments,
      contextMetadata,
    });

    res.status(201).json({
      success: true,
      message: 'Gửi phản hồi thành công',
      data: feedback,
    });
  } catch (error) {
    handleFeedbackError(error, res);
  }
};

export const getMyFeedbacks = async (
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

    const feedbacks = await getMyFeedbacksService(userId);

    res.status(200).json({
      success: true,
      data: feedbacks,
    });
  } catch (error) {
    handleFeedbackError(error, res);
  }
};

// =============================================
// II. NHÓM HANDLER DÀNH CHO ADMIN
// =============================================

export const adminGetFeedbacks = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { status, type, priority, page, limit, search } = req.query;

    const result = await adminGetFeedbacksService({
      status: status as FeedbackStatus | undefined,
      type: type as FeedbackType | undefined,
      priority: priority as FeedbackPriority | undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      search: search as string | undefined,
    });

    res.status(200).json({
      success: true,
      data: result.data,
      pagination: result.pagination,
    });
  } catch (error) {
    handleFeedbackError(error, res);
  }
};

export const adminGetFeedbackDetail = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const feedbackId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : req.params.id;
    const feedback = await adminGetFeedbackDetailService(feedbackId);

    res.status(200).json({
      success: true,
      data: feedback,
    });
  } catch (error) {
    handleFeedbackError(error, res);
  }
};

export const adminAssignFeedback = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const adminId = req.user?.id;
    if (!adminId) {
      res.status(401).json({
        success: false,
        message: 'Bạn cần đăng nhập để thực hiện thao tác này',
      });
      return;
    }

    const feedbackId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : req.params.id;
    const feedback = await adminAssignFeedbackService(feedbackId, adminId);

    res.status(200).json({
      success: true,
      message: 'Đã tiếp nhận xử lý phản hồi',
      data: feedback,
    });
  } catch (error) {
    handleFeedbackError(error, res);
  }
};

export const adminResolveFeedback = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const adminId = req.user?.id;
    if (!adminId) {
      res.status(401).json({
        success: false,
        message: 'Bạn cần đăng nhập để thực hiện thao tác này',
      });
      return;
    }

    const feedbackId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : req.params.id;
    const { adminReply } = req.body;

    const feedback = await adminResolveFeedbackService(
      feedbackId,
      adminId,
      adminReply
    );

    res.status(200).json({
      success: true,
      message: 'Đã đóng ticket phản hồi thành công',
      data: feedback,
    });
  } catch (error) {
    handleFeedbackError(error, res);
  }
};

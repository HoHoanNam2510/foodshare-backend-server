import { Request, Response } from 'express';

import {
  softDeleteConversation,
  SoftDeleteError,
} from '@/services/softDeleteService';
import {
  ChatServiceError,
  getOrCreateConversation as getOrCreateConversationService,
  sendMessage as sendMessageService,
  getMyConversations as getMyConversationsService,
  getMessagesInConversation as getMessagesInConversationService,
  markAsRead as markAsReadService,
  adminGetConversations as adminGetConversationsService,
  adminGetMessagesDetail as adminGetMessagesDetailService,
  adminToggleLockConversation as adminToggleLockConversationService,
} from '@/services/chatService';

function handleChatError(error: unknown, res: Response): void {
  if (error instanceof ChatServiceError) {
    res.status(error.statusCode).json({
      success: false,
      message: error.message,
    });
    return;
  }

  const message = error instanceof Error ? error.message : 'Lỗi không xác định';
  console.error('❌ Chat Error:', message);
  res.status(500).json({
    success: false,
    message: 'Đã xảy ra lỗi từ phía server',
  });
}

// =============================================
// I. NHÓM HANDLER DÀNH CHO USER / STORE
// =============================================

/**
 * [POST] /api/chat/conversations
 * Tìm hoặc tạo mới phòng chat 1-1 giữa 2 user.
 */
export const getOrCreateConversation = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const currentUserId = req.user?.id;
    if (!currentUserId) {
      res.status(401).json({
        success: false,
        message: 'Bạn cần đăng nhập để thực hiện thao tác này',
      });
      return;
    }

    const { receiverId } = req.body;

    const { conversation, isNew } = await getOrCreateConversationService(
      currentUserId,
      receiverId
    );

    res.status(isNew ? 201 : 200).json({
      success: true,
      data: conversation,
    });
  } catch (error) {
    handleChatError(error, res);
  }
};

/**
 * [POST] /api/chat/messages
 * Gửi tin nhắn mới vào phòng chat.
 */
export const sendMessage = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const senderId = req.user?.id;
    if (!senderId) {
      res.status(401).json({
        success: false,
        message: 'Bạn cần đăng nhập để thực hiện thao tác này',
      });
      return;
    }

    const { conversationId, text, imageUrl, location, relatedPostId } =
      req.body;

    const message = await sendMessageService(senderId, {
      conversationId,
      text,
      imageUrl,
      location,
      relatedPostId,
    });

    res.status(201).json({
      success: true,
      data: message,
    });
  } catch (error) {
    handleChatError(error, res);
  }
};

/**
 * [GET] /api/chat/conversations
 * Lấy danh sách phòng chat của user hiện tại.
 */
export const getMyConversations = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const currentUserId = req.user?.id;
    if (!currentUserId) {
      res.status(401).json({
        success: false,
        message: 'Bạn cần đăng nhập để thực hiện thao tác này',
      });
      return;
    }

    const page = req.query.page ? Number(req.query.page) : 1;
    const limit = req.query.limit ? Number(req.query.limit) : 20;

    const result = await getMyConversationsService(currentUserId, page, limit);

    res.status(200).json({
      success: true,
      data: result.data,
      pagination: result.pagination,
    });
  } catch (error) {
    handleChatError(error, res);
  }
};

/**
 * [GET] /api/chat/conversations/:conversationId/messages
 * Load lịch sử tin nhắn của 1 phòng chat.
 */
export const getMessagesInConversation = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const currentUserId = req.user?.id;
    if (!currentUserId) {
      res.status(401).json({
        success: false,
        message: 'Bạn cần đăng nhập để thực hiện thao tác này',
      });
      return;
    }

    const conversationId = Array.isArray(req.params.conversationId)
      ? req.params.conversationId[0]
      : req.params.conversationId;

    const page = req.query.page ? Number(req.query.page) : 1;
    const limit = req.query.limit ? Number(req.query.limit) : 50;

    const result = await getMessagesInConversationService(
      currentUserId,
      conversationId,
      page,
      limit
    );

    res.status(200).json({
      success: true,
      data: result.data,
      pagination: result.pagination,
    });
  } catch (error) {
    handleChatError(error, res);
  }
};

/**
 * [PUT] /api/chat/conversations/:conversationId/read
 * Đánh dấu đã đọc khi User mở phòng chat.
 */
export const markAsRead = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const currentUserId = req.user?.id;
    if (!currentUserId) {
      res.status(401).json({
        success: false,
        message: 'Bạn cần đăng nhập để thực hiện thao tác này',
      });
      return;
    }

    const conversationId = Array.isArray(req.params.conversationId)
      ? req.params.conversationId[0]
      : req.params.conversationId;

    await markAsReadService(currentUserId, conversationId);

    res.status(200).json({
      success: true,
      message: 'Đã đánh dấu đọc thành công',
    });
  } catch (error) {
    handleChatError(error, res);
  }
};

// =============================================
// II. NHÓM HANDLER DÀNH CHO ADMIN
// =============================================

/**
 * [GET] /api/chat/admin/conversations
 * Admin xem danh sách cuộc hội thoại trên hệ thống.
 */
export const adminGetConversations = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { participantId, page, limit } = req.query;

    const result = await adminGetConversationsService({
      participantId: participantId as string | undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });

    res.status(200).json({
      success: true,
      data: result.data,
      pagination: result.pagination,
    });
  } catch (error) {
    handleChatError(error, res);
  }
};

/**
 * [GET] /api/chat/admin/conversations/:conversationId/messages
 * Admin xem nội dung chi tiết bên trong đoạn chat.
 */
export const adminGetMessagesDetail = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const conversationId = Array.isArray(req.params.conversationId)
      ? req.params.conversationId[0]
      : req.params.conversationId;

    const messages = await adminGetMessagesDetailService(conversationId);

    res.status(200).json({
      success: true,
      data: messages,
    });
  } catch (error) {
    handleChatError(error, res);
  }
};

/**
 * [PUT] /api/chat/admin/conversations/:conversationId/lock
 * Admin khóa/mở khóa cuộc hội thoại.
 */
export const adminToggleLockConversation = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const conversationId = Array.isArray(req.params.conversationId)
      ? req.params.conversationId[0]
      : req.params.conversationId;

    const conversation =
      await adminToggleLockConversationService(conversationId);

    const action = conversation.status === 'LOCKED' ? 'khóa' : 'mở khóa';

    res.status(200).json({
      success: true,
      message: `Đã ${action} phòng chat thành công`,
      data: conversation,
    });
  } catch (error) {
    handleChatError(error, res);
  }
};

/**
 * [DELETE] /api/chat/conversations/:conversationId
 * User xóa cuộc trò chuyện của mình (soft delete + cascade messages).
 */
export const deleteConversation = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const currentUserId = req.user?.id;
    if (!currentUserId) {
      res.status(401).json({ success: false, message: 'Bạn cần đăng nhập' });
      return;
    }

    const conversationId = Array.isArray(req.params.conversationId)
      ? req.params.conversationId[0]
      : req.params.conversationId;

    await softDeleteConversation(conversationId, currentUserId, currentUserId);

    res.status(200).json({
      success: true,
      message: 'Cuộc trò chuyện đã được chuyển vào thùng rác',
    });
  } catch (error) {
    if (error instanceof SoftDeleteError) {
      res
        .status(error.statusCode)
        .json({ success: false, message: error.message });
      return;
    }
    handleChatError(error, res);
  }
};

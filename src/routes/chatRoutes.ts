import { Router } from 'express';
import {
  getOrCreateConversation,
  sendMessage,
  getMyConversations,
  getMessagesInConversation,
  markAsRead,
  deleteConversation,
  editMessage,
  recallMessage,
  deleteMessageForMe,
  adminGetConversations,
  adminGetMessagesDetail,
  adminToggleLockConversation,
} from '../controllers/chatController';
import { verifyAuth, verifyAdmin } from '../middlewares/authMiddleware';
import { validateBody } from '../middlewares/validateBodyMiddleware';
import { validateQuery } from '../middlewares/validateRequestMiddleware';
import {
  getOrCreateConversationSchema,
  sendMessageSchema,
  editMessageSchema,
  adminGetConversationsSchema,
} from '../validations/chatValidation';

const router = Router();

// =============================================
// NHÓM ADMIN (yêu cầu đăng nhập + quyền Admin)
// Đặt trước các route user để tránh bị catch bởi param route
// =============================================

// [GET] /api/chat/admin/conversations
// (Xem danh sách cuộc hội thoại toàn hệ thống, lọc theo participantId)
router.get(
  '/admin/conversations',
  verifyAuth,
  verifyAdmin,
  validateQuery(adminGetConversationsSchema),
  adminGetConversations
);

// [GET] /api/chat/admin/conversations/:conversationId/messages
// (Xem nội dung chi tiết bên trong đoạn chat)
router.get(
  '/admin/conversations/:conversationId/messages',
  verifyAuth,
  verifyAdmin,
  adminGetMessagesDetail
);

// [PUT] /api/chat/admin/conversations/:conversationId/lock
// (Khóa/mở khóa khẩn cấp cuộc hội thoại)
router.put(
  '/admin/conversations/:conversationId/lock',
  verifyAuth,
  verifyAdmin,
  adminToggleLockConversation
);

// =============================================
// NHÓM USER / STORE (yêu cầu đăng nhập)
// =============================================

// [GET] /api/chat/conversations
// (Lấy danh sách phòng chat của user hiện tại)
router.get('/conversations', verifyAuth, getMyConversations);

// [POST] /api/chat/conversations
// (Tìm hoặc tạo mới phòng chat 1-1)
router.post(
  '/conversations',
  verifyAuth,
  validateBody(getOrCreateConversationSchema),
  getOrCreateConversation
);

// [GET] /api/chat/conversations/:conversationId/messages
// (Load lịch sử tin nhắn)
router.get(
  '/conversations/:conversationId/messages',
  verifyAuth,
  getMessagesInConversation
);

// [PUT] /api/chat/conversations/:conversationId/read
// (Đánh dấu đã đọc)
router.put('/conversations/:conversationId/read', verifyAuth, markAsRead);

// [DELETE] /api/chat/conversations/:conversationId
// (User xóa cuộc trò chuyện — soft delete + cascade messages)
router.delete('/conversations/:conversationId', verifyAuth, deleteConversation);

// [POST] /api/chat/messages
// (Gửi tin nhắn mới)
router.post(
  '/messages',
  verifyAuth,
  validateBody(sendMessageSchema),
  sendMessage
);

// [PATCH] /api/chat/messages/:messageId
// (Sửa nội dung tin nhắn TEXT — không giới hạn thời gian, chỉ tin của chính mình)
router.patch(
  '/messages/:messageId',
  verifyAuth,
  validateBody(editMessageSchema),
  editMessage
);

// [POST] /api/chat/messages/:messageId/recall
// (Thu hồi tin nhắn — không giới hạn thời gian, chỉ tin của chính mình)
router.post('/messages/:messageId/recall', verifyAuth, recallMessage);

// [DELETE] /api/chat/messages/:messageId
// (Xóa tin nhắn chỉ ở phía người dùng hiện tại)
router.delete('/messages/:messageId', verifyAuth, deleteMessageForMe);

export default router;

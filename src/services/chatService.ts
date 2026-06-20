import mongoose from 'mongoose';
import Conversation, { IConversation } from '@/models/Conversation';
import Message, { IMessage, MessageType } from '@/models/Message';
import User from '@/models/User';
import { createNotification } from '@/services/notificationService';
import { deleteImageByUrl } from '@/services/uploadService';
import { isUserOnline } from '@/utils/presenceStore';

export class ChatServiceError extends Error {
  public statusCode: number;
  public errorCode?: string;

  constructor(message: string, statusCode: number, errorCode?: string) {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
  }
}

// =============================================
// I. NHÓM SERVICE DÀNH CHO USER / STORE
// =============================================

/**
 * Tìm phòng chat cũ giữa 2 user, nếu không có thì tạo mới.
 * Khởi tạo unreadCount = 0 cho cả 2 người.
 */
export async function getOrCreateConversation(
  currentUserId: string,
  receiverId: string
): Promise<{ conversation: IConversation; isNew: boolean }> {
  if (currentUserId === receiverId) {
    throw new ChatServiceError(
      'Không thể tạo cuộc trò chuyện với chính mình',
      400
    );
  }

  if (!mongoose.Types.ObjectId.isValid(receiverId)) {
    throw new ChatServiceError('receiverId không hợp lệ', 400);
  }

  // Tìm conversation có cả 2 participant
  const existing = await Conversation.findOne({
    participants: { $all: [currentUserId, receiverId] },
  })
    .populate('participants', 'fullName avatar')
    .populate('lastMessage');

  if (existing) {
    return { conversation: existing, isNew: false };
  }

  // Tạo mới
  const newConversation = await Conversation.create({
    participants: [currentUserId, receiverId],
    unreadCount: new Map([
      [currentUserId, 0],
      [receiverId, 0],
    ]),
  });

  // Populate để trả về đầy đủ thông tin
  const populated = await Conversation.findById(newConversation._id).populate(
    'participants',
    'fullName avatar'
  );
  if (!populated) {
    throw new ChatServiceError('Không thể tải thông tin phòng chat', 500);
  }

  return { conversation: populated as IConversation, isNew: true };
}

interface SendMessageInput {
  conversationId: string;
  text?: string;
  imageUrl?: string;
  location?: { latitude: number; longitude: number };
  relatedPostId?: string;
}

/**
 * Gửi tin nhắn vào phòng chat.
 * Kiểm tra quyền tham gia + trạng thái phòng chat.
 * Cập nhật lastMessage, unreadCount cho người nhận.
 */
export async function sendMessage(
  senderId: string,
  data: SendMessageInput
): Promise<IMessage> {
  const { conversationId, text, imageUrl, location, relatedPostId } = data;

  if (!mongoose.Types.ObjectId.isValid(conversationId)) {
    throw new ChatServiceError('conversationId không hợp lệ', 400);
  }

  // Kiểm tra conversation tồn tại
  const conversation = await Conversation.findById(conversationId);
  if (!conversation) {
    throw new ChatServiceError('Không tìm thấy phòng chat', 404);
  }

  // Kiểm tra user có thuộc participants không
  const isParticipant = conversation.participants.some(
    (p) => p.toString() === senderId
  );
  if (!isParticipant) {
    throw new ChatServiceError(
      'Bạn không phải thành viên của phòng chat này',
      403
    );
  }

  // Kiểm tra trạng thái phòng chat
  if (conversation.status === 'LOCKED') {
    throw new ChatServiceError(
      'Phòng chat đã bị khóa, không thể gửi tin nhắn',
      403
    );
  }

  // Rate-limit ảnh: tối đa 5 ảnh/phút/người trong cùng conversation
  if (imageUrl) {
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
    const recentImageCount = await Message.countDocuments({
      conversationId,
      senderId,
      messageType: 'IMAGE',
      createdAt: { $gte: oneMinuteAgo },
    });
    if (recentImageCount >= 5) {
      throw new ChatServiceError(
        'Bạn đã gửi quá nhiều ảnh. Vui lòng chờ một chút rồi thử lại.',
        429,
        'IMAGE_RATE_LIMIT'
      );
    }
  }

  // Xác định messageType và content
  let messageType: MessageType = 'TEXT';
  let content = text || '';

  if (imageUrl) {
    messageType = 'IMAGE';
    content = content || imageUrl;
  } else if (location) {
    messageType = 'LOCATION';
    content = content || `${location.latitude},${location.longitude}`;
  }

  // Tạo Message mới
  const messageData: Record<string, unknown> = {
    conversationId,
    senderId,
    messageType,
    content,
  };

  if (imageUrl) messageData.imageUrl = imageUrl;
  if (location) messageData.location = location;
  if (relatedPostId) {
    if (!mongoose.Types.ObjectId.isValid(relatedPostId)) {
      throw new ChatServiceError('relatedPostId không hợp lệ', 400);
    }
    messageData.relatedPostId = relatedPostId;
  }

  const message = await Message.create(messageData);

  // Cập nhật Conversation: lastMessage, lastMessageAt, unreadCount cho receiver
  const receiverId = conversation.participants.find(
    (p) => p.toString() !== senderId
  );

  if (receiverId) {
    const receiverKey = receiverId.toString();
    const currentUnread = conversation.unreadCount.get(receiverKey) || 0;
    conversation.unreadCount.set(receiverKey, currentUnread + 1);
  }

  conversation.lastMessage = message._id as mongoose.Types.ObjectId;
  conversation.lastMessageAt = message.createdAt;
  await conversation.save();

  // Populate relatedPostId nếu có
  if (relatedPostId) {
    await message.populate('relatedPostId', 'title images');
  }

  // Push notification khi người nhận offline
  if (receiverId && !isUserOnline(receiverId.toString())) {
    const [sender, receiver] = await Promise.all([
      User.findById(senderId).select('fullName').lean(),
      User.findById(receiverId).select('language').lean(),
    ]);
    const senderName = sender?.fullName ?? 'FoodShare';
    const lang = (receiver as { language?: string } | null)?.language ?? 'vi';

    let body: string;
    if (messageType === 'IMAGE') {
      body =
        lang === 'en'
          ? `${senderName} sent an image`
          : `${senderName} đã gửi một ảnh`;
    } else if (messageType === 'LOCATION') {
      body =
        lang === 'en'
          ? `${senderName} shared a location`
          : `${senderName} đã chia sẻ vị trí`;
    } else {
      const truncated =
        content.length > 60 ? `${content.slice(0, 60)}…` : content;
      body =
        lang === 'en'
          ? `${senderName}: "${truncated}"`
          : `${senderName} gửi "${truncated}"`;
    }

    createNotification(
      receiverId.toString(),
      'CHAT',
      senderName,
      body,
      conversationId
    ).catch(() => {});
  }

  return message;
}

interface PaginatedConversations {
  data: IConversation[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Lấy danh sách phòng chat của user hiện tại.
 * Populate participants + lastMessage, sắp xếp theo updatedAt giảm dần.
 */
export async function getMyConversations(
  currentUserId: string,
  page: number = 1,
  limit: number = 20
): Promise<PaginatedConversations> {
  const filter = { participants: currentUserId };
  const skip = (page - 1) * limit;

  const [conversations, total] = await Promise.all([
    Conversation.find(filter)
      .populate('participants', 'fullName avatar')
      .populate('lastMessage')
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Conversation.countDocuments(filter),
  ]);

  return {
    data: conversations as IConversation[],
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

interface PaginatedMessages {
  data: IMessage[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Load lịch sử tin nhắn của 1 phòng chat.
 * Kiểm tra quyền tham gia, sắp xếp theo createdAt giảm dần (mới nhất trước).
 * Populate relatedPostId nếu có.
 */
export async function getMessagesInConversation(
  currentUserId: string,
  conversationId: string,
  page: number = 1,
  limit: number = 50
): Promise<PaginatedMessages> {
  if (!mongoose.Types.ObjectId.isValid(conversationId)) {
    throw new ChatServiceError('conversationId không hợp lệ', 400);
  }

  const conversation = await Conversation.findById(conversationId);
  if (!conversation) {
    throw new ChatServiceError('Không tìm thấy phòng chat', 404);
  }

  const isParticipant = conversation.participants.some(
    (p) => p.toString() === currentUserId
  );
  if (!isParticipant) {
    throw new ChatServiceError(
      'Bạn không phải thành viên của phòng chat này',
      403
    );
  }

  const skip = (page - 1) * limit;

  const baseFilter = {
    conversationId,
    deletedFor: { $nin: [currentUserId] },
  };

  const [messages, total] = await Promise.all([
    Message.find(baseFilter)
      .populate('relatedPostId', 'title images')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Message.countDocuments(baseFilter),
  ]);

  return {
    data: messages as IMessage[],
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Đánh dấu đã đọc khi User bấm vào xem phòng chat.
 * Reset unreadCount về 0 cho currentUser, update isRead cho các message từ người khác.
 */
export async function markAsRead(
  currentUserId: string,
  conversationId: string
): Promise<void> {
  if (!mongoose.Types.ObjectId.isValid(conversationId)) {
    throw new ChatServiceError('conversationId không hợp lệ', 400);
  }

  const conversation = await Conversation.findById(conversationId);
  if (!conversation) {
    throw new ChatServiceError('Không tìm thấy phòng chat', 404);
  }

  const isParticipant = conversation.participants.some(
    (p) => p.toString() === currentUserId
  );
  if (!isParticipant) {
    throw new ChatServiceError(
      'Bạn không phải thành viên của phòng chat này',
      403
    );
  }

  // Reset unreadCount về 0 cho currentUser
  conversation.unreadCount.set(currentUserId, 0);
  await conversation.save();

  // Update tất cả message chưa đọc (từ người khác gửi) thành isRead = true
  await Message.updateMany(
    {
      conversationId,
      senderId: { $ne: currentUserId },
      isRead: false,
    },
    { isRead: true }
  );
}

/**
 * Sửa nội dung tin nhắn TEXT của chính mình (không giới hạn thời gian).
 */
export async function editMessage(
  userId: string,
  messageId: string,
  text: string
): Promise<IMessage> {
  if (!mongoose.Types.ObjectId.isValid(messageId)) {
    throw new ChatServiceError('messageId không hợp lệ', 400);
  }

  const message = await Message.findById(messageId);
  if (!message) {
    throw new ChatServiceError('Không tìm thấy tin nhắn', 404);
  }
  if (message.senderId.toString() !== userId) {
    throw new ChatServiceError(
      'Bạn không thể sửa tin nhắn của người khác',
      403
    );
  }
  if (message.messageType !== 'TEXT') {
    throw new ChatServiceError('Chỉ có thể sửa tin nhắn văn bản', 400);
  }
  if (message.isRecalled) {
    throw new ChatServiceError('Tin nhắn đã bị thu hồi, không thể sửa', 400);
  }

  message.content = text;
  message.isEdited = true;
  message.editedAt = new Date();
  await message.save();

  return message;
}

/**
 * Thu hồi tin nhắn (ẩn nội dung với cả 2 phía, không giới hạn thời gian).
 */
export async function recallMessage(
  userId: string,
  messageId: string
): Promise<IMessage> {
  if (!mongoose.Types.ObjectId.isValid(messageId)) {
    throw new ChatServiceError('messageId không hợp lệ', 400);
  }

  const message = await Message.findById(messageId);
  if (!message) {
    throw new ChatServiceError('Không tìm thấy tin nhắn', 404);
  }
  if (message.senderId.toString() !== userId) {
    throw new ChatServiceError(
      'Bạn không thể thu hồi tin nhắn của người khác',
      403
    );
  }
  if (message.isRecalled) {
    throw new ChatServiceError('Tin nhắn đã bị thu hồi rồi', 400);
  }

  // Thu hồi ẩn tin với cả 2 phía nên ảnh không còn được dùng tới: gỡ imageUrl
  // khỏi DB và xóa file gốc trên Cloudinary. Giữ lại URL trước khi gỡ để xóa.
  const recalledImageUrl =
    message.messageType === 'IMAGE' ? message.imageUrl : undefined;

  message.isRecalled = true;
  message.recalledAt = new Date();
  if (recalledImageUrl) message.imageUrl = undefined;
  await message.save();

  // Mỗi ảnh có publicId riêng → xóa an toàn. Fire-and-forget, không chặn response.
  if (recalledImageUrl) {
    deleteImageByUrl(recalledImageUrl).catch(() => {});
  }

  return message;
}

/**
 * Xóa tin nhắn chỉ ở phía người dùng hiện tại (push userId vào deletedFor).
 */
export async function deleteMessageForMe(
  userId: string,
  messageId: string
): Promise<void> {
  if (!mongoose.Types.ObjectId.isValid(messageId)) {
    throw new ChatServiceError('messageId không hợp lệ', 400);
  }

  const message = await Message.findById(messageId);
  if (!message) {
    throw new ChatServiceError('Không tìm thấy tin nhắn', 404);
  }

  const conversation = await Conversation.findById(message.conversationId);
  const isParticipant = conversation?.participants.some(
    (p) => p.toString() === userId
  );
  if (!isParticipant) {
    throw new ChatServiceError(
      'Bạn không phải thành viên của phòng chat này',
      403
    );
  }

  const alreadyDeleted = message.deletedFor.some(
    (id) => id.toString() === userId
  );
  if (!alreadyDeleted) {
    message.deletedFor.push(new mongoose.Types.ObjectId(userId));
    await message.save();
  }
}

// =============================================
// II. NHÓM SERVICE DÀNH CHO ADMIN
// =============================================

interface AdminGetConversationsQuery {
  participantId?: string;
  page?: number;
  limit?: number;
}

/**
 * Admin xem danh sách cuộc hội thoại trên hệ thống.
 * Hỗ trợ lọc theo participantId (xem các chat của 1 user bị nghi ngờ).
 */
export async function adminGetConversations(
  query: AdminGetConversationsQuery
): Promise<PaginatedConversations> {
  const { participantId, page = 1, limit = 20 } = query;

  const filter: Record<string, unknown> = {};
  if (participantId) {
    if (!mongoose.Types.ObjectId.isValid(participantId)) {
      throw new ChatServiceError('participantId không hợp lệ', 400);
    }
    filter.participants = participantId;
  }

  const skip = (page - 1) * limit;

  const [conversations, total] = await Promise.all([
    Conversation.find(filter)
      .populate('participants', 'fullName email avatar')
      .populate('lastMessage')
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Conversation.countDocuments(filter),
  ]);

  return {
    data: conversations as IConversation[],
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Admin xem nội dung chi tiết bên trong đoạn chat.
 */
export async function adminGetMessagesDetail(
  conversationId: string
): Promise<IMessage[]> {
  if (!mongoose.Types.ObjectId.isValid(conversationId)) {
    throw new ChatServiceError('conversationId không hợp lệ', 400);
  }

  const conversation = await Conversation.findById(conversationId);
  if (!conversation) {
    throw new ChatServiceError('Không tìm thấy phòng chat', 404);
  }

  const messages = await Message.find({ conversationId })
    .populate('senderId', 'fullName avatar')
    .populate('relatedPostId', 'title images')
    .sort({ createdAt: 1 })
    .lean();

  return messages as IMessage[];
}

/**
 * Admin khóa/mở khóa khẩn cấp cuộc hội thoại.
 * Toggle giữa ACTIVE <-> LOCKED.
 */
export async function adminToggleLockConversation(
  conversationId: string
): Promise<IConversation> {
  if (!mongoose.Types.ObjectId.isValid(conversationId)) {
    throw new ChatServiceError('conversationId không hợp lệ', 400);
  }

  const conversation = await Conversation.findById(conversationId);
  if (!conversation) {
    throw new ChatServiceError('Không tìm thấy phòng chat', 404);
  }

  conversation.status = conversation.status === 'ACTIVE' ? 'LOCKED' : 'ACTIVE';
  await conversation.save();

  return conversation;
}

import { Request, Response } from 'express';

import {
  getOrCreateConversation,
  sendMessage,
  getMyConversations,
  getMessagesInConversation,
  markAsRead,
  adminGetConversations,
  adminGetMessagesDetail,
  adminToggleLockConversation,
} from '@/controllers/chatController';
import * as chatService from '@/services/chatService';

jest.mock('@/services/chatService', () => ({
  __esModule: true,
  ChatServiceError: class ChatServiceError extends Error {
    public statusCode: number;
    constructor(message: string, statusCode: number) {
      super(message);
      this.statusCode = statusCode;
    }
  },
  getOrCreateConversation: jest.fn(),
  sendMessage: jest.fn(),
  getMyConversations: jest.fn(),
  getMessagesInConversation: jest.fn(),
  markAsRead: jest.fn(),
  adminGetConversations: jest.fn(),
  adminGetMessagesDetail: jest.fn(),
  adminToggleLockConversation: jest.fn(),
}));

// =============================================
// Helpers
// =============================================

const mockedService = chatService as unknown as {
  getOrCreateConversation: jest.Mock;
  sendMessage: jest.Mock;
  getMyConversations: jest.Mock;
  getMessagesInConversation: jest.Mock;
  markAsRead: jest.Mock;
  adminGetConversations: jest.Mock;
  adminGetMessagesDetail: jest.Mock;
  adminToggleLockConversation: jest.Mock;
};

function createResponse(): Response {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return res as unknown as Response;
}

function createAuthRequest(
  overrides: Partial<Request> & { user?: { id: string; role: string } } = {}
): Request {
  return {
    user: { id: VALID_USER_ID, role: 'USER' },
    body: {},
    params: {},
    query: {},
    headers: {},
    ...overrides,
  } as unknown as Request;
}

const VALID_USER_ID = '507f191e810c19729de860ea';
const VALID_RECEIVER_ID = '607f191e810c19729de860eb';
const VALID_CONVERSATION_ID = '707f191e810c19729de860ec';
const VALID_MESSAGE_ID = '807f191e810c19729de860ed';
const ADMIN_ID = '907f191e810c19729de860ee';

// =============================================
// getOrCreateConversation (CHT_F01)
// =============================================
describe('getOrCreateConversation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns existing conversation with 200', async () => {
    const req = createAuthRequest({ body: { receiverId: VALID_RECEIVER_ID } });
    const res = createResponse();

    const mockConversation = {
      _id: VALID_CONVERSATION_ID,
      participants: [VALID_USER_ID, VALID_RECEIVER_ID],
    };
    mockedService.getOrCreateConversation.mockResolvedValue({
      conversation: mockConversation,
      isNew: false,
    });

    await getOrCreateConversation(req, res);

    expect(mockedService.getOrCreateConversation).toHaveBeenCalledWith(
      VALID_USER_ID,
      VALID_RECEIVER_ID
    );
    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(200);
    expect(res.json as unknown as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: mockConversation })
    );
  });

  it('creates new conversation with 201', async () => {
    const req = createAuthRequest({ body: { receiverId: VALID_RECEIVER_ID } });
    const res = createResponse();

    const mockConversation = {
      _id: VALID_CONVERSATION_ID,
      participants: [VALID_USER_ID, VALID_RECEIVER_ID],
    };
    mockedService.getOrCreateConversation.mockResolvedValue({
      conversation: mockConversation,
      isNew: true,
    });

    await getOrCreateConversation(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(201);
    expect(res.json as unknown as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: mockConversation })
    );
  });

  it('returns 401 when user is not authenticated', async () => {
    const req = createAuthRequest({
      user: undefined,
      body: { receiverId: VALID_RECEIVER_ID },
    });
    const res = createResponse();

    await getOrCreateConversation(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(401);
    expect(mockedService.getOrCreateConversation).not.toHaveBeenCalled();
  });

  it('returns 400 when trying to chat with self', async () => {
    const req = createAuthRequest({ body: { receiverId: VALID_USER_ID } });
    const res = createResponse();

    mockedService.getOrCreateConversation.mockRejectedValue(
      new chatService.ChatServiceError(
        'Không thể tạo cuộc trò chuyện với chính mình',
        400
      )
    );

    await getOrCreateConversation(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(400);
  });

  it('returns 500 on unexpected error without leaking details', async () => {
    const req = createAuthRequest({ body: { receiverId: VALID_RECEIVER_ID } });
    const res = createResponse();

    mockedService.getOrCreateConversation.mockRejectedValue(
      new Error('DB connection lost')
    );

    await getOrCreateConversation(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(500);
    const jsonCall = (res.json as unknown as jest.Mock).mock.calls[0][0];
    expect(jsonCall.success).toBe(false);
    expect(jsonCall.error).toBeUndefined();
    expect(jsonCall.message).toBe('Đã xảy ra lỗi từ phía server');
  });
});

// =============================================
// sendMessage (CHT_F02, CHT_F03, CHT_F04)
// =============================================
describe('sendMessage', () => {
  const validBody = {
    conversationId: VALID_CONVERSATION_ID,
    text: 'Xin chào, tôi quan tâm đến món này',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sends text message successfully and returns 201', async () => {
    const req = createAuthRequest({ body: validBody });
    const res = createResponse();

    const mockMessage = {
      _id: VALID_MESSAGE_ID,
      conversationId: VALID_CONVERSATION_ID,
      senderId: VALID_USER_ID,
      messageType: 'TEXT',
      content: validBody.text,
    };
    mockedService.sendMessage.mockResolvedValue(mockMessage);

    await sendMessage(req, res);

    expect(mockedService.sendMessage).toHaveBeenCalledWith(VALID_USER_ID, {
      conversationId: VALID_CONVERSATION_ID,
      text: validBody.text,
      imageUrl: undefined,
      location: undefined,
      relatedPostId: undefined,
    });
    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(201);
    expect(res.json as unknown as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: mockMessage })
    );
  });

  it('sends image message with imageUrl', async () => {
    const body = {
      conversationId: VALID_CONVERSATION_ID,
      imageUrl: 'https://img.test/photo.png',
    };
    const req = createAuthRequest({ body });
    const res = createResponse();

    const mockMessage = {
      _id: VALID_MESSAGE_ID,
      messageType: 'IMAGE',
      imageUrl: body.imageUrl,
    };
    mockedService.sendMessage.mockResolvedValue(mockMessage);

    await sendMessage(req, res);

    expect(mockedService.sendMessage).toHaveBeenCalledWith(
      VALID_USER_ID,
      expect.objectContaining({ imageUrl: body.imageUrl })
    );
    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(201);
  });

  it('sends location message', async () => {
    const body = {
      conversationId: VALID_CONVERSATION_ID,
      location: { latitude: 10.762622, longitude: 106.660172 },
    };
    const req = createAuthRequest({ body });
    const res = createResponse();

    const mockMessage = {
      _id: VALID_MESSAGE_ID,
      messageType: 'LOCATION',
      location: body.location,
    };
    mockedService.sendMessage.mockResolvedValue(mockMessage);

    await sendMessage(req, res);

    expect(mockedService.sendMessage).toHaveBeenCalledWith(
      VALID_USER_ID,
      expect.objectContaining({ location: body.location })
    );
    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(201);
  });

  it('sends message with relatedPostId', async () => {
    const relatedPostId = '607f191e810c19729de860eb';
    const body = {
      conversationId: VALID_CONVERSATION_ID,
      text: 'Tôi quan tâm đến món này',
      relatedPostId,
    };
    const req = createAuthRequest({ body });
    const res = createResponse();

    mockedService.sendMessage.mockResolvedValue({
      _id: VALID_MESSAGE_ID,
      relatedPostId,
    });

    await sendMessage(req, res);

    expect(mockedService.sendMessage).toHaveBeenCalledWith(
      VALID_USER_ID,
      expect.objectContaining({ relatedPostId })
    );
  });

  it('returns 401 when user is not authenticated', async () => {
    const req = createAuthRequest({ user: undefined, body: validBody });
    const res = createResponse();

    await sendMessage(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(401);
    expect(mockedService.sendMessage).not.toHaveBeenCalled();
  });

  it('returns 404 when conversation not found', async () => {
    const req = createAuthRequest({ body: validBody });
    const res = createResponse();

    mockedService.sendMessage.mockRejectedValue(
      new chatService.ChatServiceError('Không tìm thấy phòng chat', 404)
    );

    await sendMessage(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(404);
  });

  it('returns 403 when user is not a participant', async () => {
    const req = createAuthRequest({ body: validBody });
    const res = createResponse();

    mockedService.sendMessage.mockRejectedValue(
      new chatService.ChatServiceError(
        'Bạn không phải thành viên của phòng chat này',
        403
      )
    );

    await sendMessage(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(403);
  });

  it('returns 403 when conversation is locked', async () => {
    const req = createAuthRequest({ body: validBody });
    const res = createResponse();

    mockedService.sendMessage.mockRejectedValue(
      new chatService.ChatServiceError(
        'Phòng chat đã bị khóa, không thể gửi tin nhắn',
        403
      )
    );

    await sendMessage(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(403);
  });

  it('returns 500 on unexpected error without leaking details', async () => {
    const req = createAuthRequest({ body: validBody });
    const res = createResponse();

    mockedService.sendMessage.mockRejectedValue(new Error('MongoDB timeout'));

    await sendMessage(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(500);
    const jsonCall = (res.json as unknown as jest.Mock).mock.calls[0][0];
    expect(jsonCall.success).toBe(false);
    expect(jsonCall.error).toBeUndefined();
    expect(jsonCall.message).toBe('Đã xảy ra lỗi từ phía server');
  });
});

// =============================================
// getMyConversations
// =============================================
describe('getMyConversations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns paginated conversations with 200', async () => {
    const req = createAuthRequest({ query: { page: '1', limit: '10' } });
    const res = createResponse();

    const mockResult = {
      data: [{ _id: VALID_CONVERSATION_ID }],
      pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
    };
    mockedService.getMyConversations.mockResolvedValue(mockResult);

    await getMyConversations(req, res);

    expect(mockedService.getMyConversations).toHaveBeenCalledWith(
      VALID_USER_ID,
      1,
      10
    );
    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(200);
    expect(res.json as unknown as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: mockResult.data,
        pagination: mockResult.pagination,
      })
    );
  });

  it('uses defaults when page/limit not provided', async () => {
    const req = createAuthRequest({ query: {} });
    const res = createResponse();

    mockedService.getMyConversations.mockResolvedValue({
      data: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });

    await getMyConversations(req, res);

    expect(mockedService.getMyConversations).toHaveBeenCalledWith(
      VALID_USER_ID,
      1,
      20
    );
  });

  it('returns 401 when user is not authenticated', async () => {
    const req = createAuthRequest({ user: undefined });
    const res = createResponse();

    await getMyConversations(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(401);
    expect(mockedService.getMyConversations).not.toHaveBeenCalled();
  });
});

// =============================================
// getMessagesInConversation
// =============================================
describe('getMessagesInConversation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns paginated messages with 200', async () => {
    const req = createAuthRequest({
      params: { conversationId: VALID_CONVERSATION_ID },
      query: { page: '1', limit: '50' },
    });
    const res = createResponse();

    const mockResult = {
      data: [{ _id: VALID_MESSAGE_ID, content: 'Hello' }],
      pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
    };
    mockedService.getMessagesInConversation.mockResolvedValue(mockResult);

    await getMessagesInConversation(req, res);

    expect(mockedService.getMessagesInConversation).toHaveBeenCalledWith(
      VALID_USER_ID,
      VALID_CONVERSATION_ID,
      1,
      50
    );
    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(200);
    expect(res.json as unknown as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: mockResult.data,
        pagination: mockResult.pagination,
      })
    );
  });

  it('uses defaults when page/limit not provided', async () => {
    const req = createAuthRequest({
      params: { conversationId: VALID_CONVERSATION_ID },
      query: {},
    });
    const res = createResponse();

    mockedService.getMessagesInConversation.mockResolvedValue({
      data: [],
      pagination: { page: 1, limit: 50, total: 0, totalPages: 0 },
    });

    await getMessagesInConversation(req, res);

    expect(mockedService.getMessagesInConversation).toHaveBeenCalledWith(
      VALID_USER_ID,
      VALID_CONVERSATION_ID,
      1,
      50
    );
  });

  it('returns 401 when user is not authenticated', async () => {
    const req = createAuthRequest({
      user: undefined,
      params: { conversationId: VALID_CONVERSATION_ID },
    });
    const res = createResponse();

    await getMessagesInConversation(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(401);
    expect(mockedService.getMessagesInConversation).not.toHaveBeenCalled();
  });

  it('returns 404 when conversation not found', async () => {
    const req = createAuthRequest({
      params: { conversationId: VALID_CONVERSATION_ID },
    });
    const res = createResponse();

    mockedService.getMessagesInConversation.mockRejectedValue(
      new chatService.ChatServiceError('Không tìm thấy phòng chat', 404)
    );

    await getMessagesInConversation(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(404);
  });

  it('returns 403 when user is not a participant', async () => {
    const req = createAuthRequest({
      params: { conversationId: VALID_CONVERSATION_ID },
    });
    const res = createResponse();

    mockedService.getMessagesInConversation.mockRejectedValue(
      new chatService.ChatServiceError(
        'Bạn không phải thành viên của phòng chat này',
        403
      )
    );

    await getMessagesInConversation(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(403);
  });
});

// =============================================
// markAsRead
// =============================================
describe('markAsRead', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('marks conversation as read and returns 200', async () => {
    const req = createAuthRequest({
      params: { conversationId: VALID_CONVERSATION_ID },
    });
    const res = createResponse();

    mockedService.markAsRead.mockResolvedValue(undefined);

    await markAsRead(req, res);

    expect(mockedService.markAsRead).toHaveBeenCalledWith(
      VALID_USER_ID,
      VALID_CONVERSATION_ID
    );
    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(200);
    expect(res.json as unknown as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: 'Đã đánh dấu đọc thành công',
      })
    );
  });

  it('returns 401 when user is not authenticated', async () => {
    const req = createAuthRequest({
      user: undefined,
      params: { conversationId: VALID_CONVERSATION_ID },
    });
    const res = createResponse();

    await markAsRead(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(401);
    expect(mockedService.markAsRead).not.toHaveBeenCalled();
  });

  it('returns 404 when conversation not found', async () => {
    const req = createAuthRequest({
      params: { conversationId: VALID_CONVERSATION_ID },
    });
    const res = createResponse();

    mockedService.markAsRead.mockRejectedValue(
      new chatService.ChatServiceError('Không tìm thấy phòng chat', 404)
    );

    await markAsRead(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(404);
  });

  it('returns 403 when user is not a participant', async () => {
    const req = createAuthRequest({
      params: { conversationId: VALID_CONVERSATION_ID },
    });
    const res = createResponse();

    mockedService.markAsRead.mockRejectedValue(
      new chatService.ChatServiceError(
        'Bạn không phải thành viên của phòng chat này',
        403
      )
    );

    await markAsRead(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(403);
  });
});

// =============================================
// adminGetConversations (ADM_C01)
// =============================================
describe('adminGetConversations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns paginated conversations with 200', async () => {
    const req = createAuthRequest({
      user: { id: ADMIN_ID, role: 'ADMIN' },
      query: { participantId: VALID_USER_ID, page: '1', limit: '10' },
    });
    const res = createResponse();

    const mockResult = {
      data: [{ _id: VALID_CONVERSATION_ID }],
      pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
    };
    mockedService.adminGetConversations.mockResolvedValue(mockResult);

    await adminGetConversations(req, res);

    expect(mockedService.adminGetConversations).toHaveBeenCalledWith({
      participantId: VALID_USER_ID,
      page: 1,
      limit: 10,
    });
    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(200);
    expect(res.json as unknown as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: mockResult.data,
        pagination: mockResult.pagination,
      })
    );
  });

  it('uses defaults when query params not provided', async () => {
    const req = createAuthRequest({
      user: { id: ADMIN_ID, role: 'ADMIN' },
      query: {},
    });
    const res = createResponse();

    mockedService.adminGetConversations.mockResolvedValue({
      data: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });

    await adminGetConversations(req, res);

    expect(mockedService.adminGetConversations).toHaveBeenCalledWith({
      participantId: undefined,
      page: undefined,
      limit: undefined,
    });
  });
});

// =============================================
// adminGetMessagesDetail
// =============================================
describe('adminGetMessagesDetail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns messages detail with 200', async () => {
    const req = createAuthRequest({
      user: { id: ADMIN_ID, role: 'ADMIN' },
      params: { conversationId: VALID_CONVERSATION_ID },
    });
    const res = createResponse();

    const mockMessages = [
      { _id: VALID_MESSAGE_ID, content: 'Hello' },
      { _id: '808f191e810c19729de860ef', content: 'Hi there' },
    ];
    mockedService.adminGetMessagesDetail.mockResolvedValue(mockMessages);

    await adminGetMessagesDetail(req, res);

    expect(mockedService.adminGetMessagesDetail).toHaveBeenCalledWith(
      VALID_CONVERSATION_ID
    );
    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(200);
    expect(res.json as unknown as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: mockMessages })
    );
  });

  it('returns 404 when conversation not found', async () => {
    const req = createAuthRequest({
      user: { id: ADMIN_ID, role: 'ADMIN' },
      params: { conversationId: VALID_CONVERSATION_ID },
    });
    const res = createResponse();

    mockedService.adminGetMessagesDetail.mockRejectedValue(
      new chatService.ChatServiceError('Không tìm thấy phòng chat', 404)
    );

    await adminGetMessagesDetail(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(404);
  });

  it('returns 400 when conversationId is invalid', async () => {
    const req = createAuthRequest({
      user: { id: ADMIN_ID, role: 'ADMIN' },
      params: { conversationId: 'invalid-id' },
    });
    const res = createResponse();

    mockedService.adminGetMessagesDetail.mockRejectedValue(
      new chatService.ChatServiceError('conversationId không hợp lệ', 400)
    );

    await adminGetMessagesDetail(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(400);
  });
});

// =============================================
// adminToggleLockConversation (ADM_C02)
// =============================================
describe('adminToggleLockConversation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('locks conversation and returns 200 with lock message', async () => {
    const req = createAuthRequest({
      user: { id: ADMIN_ID, role: 'ADMIN' },
      params: { conversationId: VALID_CONVERSATION_ID },
    });
    const res = createResponse();

    const mockConversation = {
      _id: VALID_CONVERSATION_ID,
      status: 'LOCKED',
    };
    mockedService.adminToggleLockConversation.mockResolvedValue(
      mockConversation
    );

    await adminToggleLockConversation(req, res);

    expect(mockedService.adminToggleLockConversation).toHaveBeenCalledWith(
      VALID_CONVERSATION_ID
    );
    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(200);
    expect(res.json as unknown as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: 'Đã khóa phòng chat thành công',
        data: mockConversation,
      })
    );
  });

  it('unlocks conversation and returns 200 with unlock message', async () => {
    const req = createAuthRequest({
      user: { id: ADMIN_ID, role: 'ADMIN' },
      params: { conversationId: VALID_CONVERSATION_ID },
    });
    const res = createResponse();

    const mockConversation = {
      _id: VALID_CONVERSATION_ID,
      status: 'ACTIVE',
    };
    mockedService.adminToggleLockConversation.mockResolvedValue(
      mockConversation
    );

    await adminToggleLockConversation(req, res);

    expect(res.json as unknown as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: 'Đã mở khóa phòng chat thành công',
      })
    );
  });

  it('returns 404 when conversation not found', async () => {
    const req = createAuthRequest({
      user: { id: ADMIN_ID, role: 'ADMIN' },
      params: { conversationId: VALID_CONVERSATION_ID },
    });
    const res = createResponse();

    mockedService.adminToggleLockConversation.mockRejectedValue(
      new chatService.ChatServiceError('Không tìm thấy phòng chat', 404)
    );

    await adminToggleLockConversation(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(404);
  });

  it('returns 400 when conversationId is invalid', async () => {
    const req = createAuthRequest({
      user: { id: ADMIN_ID, role: 'ADMIN' },
      params: { conversationId: 'invalid-id' },
    });
    const res = createResponse();

    mockedService.adminToggleLockConversation.mockRejectedValue(
      new chatService.ChatServiceError('conversationId không hợp lệ', 400)
    );

    await adminToggleLockConversation(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(400);
  });

  it('returns 500 on unexpected error without leaking details', async () => {
    const req = createAuthRequest({
      user: { id: ADMIN_ID, role: 'ADMIN' },
      params: { conversationId: VALID_CONVERSATION_ID },
    });
    const res = createResponse();

    mockedService.adminToggleLockConversation.mockRejectedValue(
      new Error('MongoDB timeout')
    );

    await adminToggleLockConversation(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(500);
    const jsonCall = (res.json as unknown as jest.Mock).mock.calls[0][0];
    expect(jsonCall.success).toBe(false);
    expect(jsonCall.error).toBeUndefined();
    expect(jsonCall.message).toBe('Đã xảy ra lỗi từ phía server');
  });
});

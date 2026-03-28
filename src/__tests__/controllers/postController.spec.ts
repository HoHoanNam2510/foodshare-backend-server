import { Request, Response } from 'express';

import {
  createPost,
  sendCreatePostPasscode,
  getMyPosts,
  updatePost,
  deletePost,
  getPostDetail,
  searchMapPosts,
  adminGetPosts,
  adminUpdatePost,
  adminToggleHidePost,
} from '@/controllers/postController';
import Post from '@/models/Post';
import PostCreationPasscode from '@/models/PostCreationPasscode';
import User from '@/models/User';
import { sendPostPasscodeEmail } from '@/utils/postPasscodeEmail';
import * as postService from '@/services/postService';

jest.mock('@/models/Post', () => ({
  __esModule: true,
  default: {
    create: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    findOneAndDelete: jest.fn(),
  },
}));

jest.mock('@/models/PostCreationPasscode', () => ({
  __esModule: true,
  default: {
    countDocuments: jest.fn(),
    updateMany: jest.fn(),
    create: jest.fn(),
    findByIdAndDelete: jest.fn(),
    findOne: jest.fn(),
  },
}));

jest.mock('@/models/User', () => ({
  __esModule: true,
  default: {
    findById: jest.fn(),
  },
}));

jest.mock('@/utils/postPasscodeEmail', () => ({
  __esModule: true,
  sendPostPasscodeEmail: jest.fn(),
}));

jest.mock('@/services/postService', () => ({
  __esModule: true,
  runAIModerationJob: jest.fn().mockResolvedValue(undefined),
  getAdminPostList: jest.fn(),
}));

// =============================================
// Helpers
// =============================================

const mockedPost = Post as unknown as {
  create: jest.Mock;
  find: jest.Mock;
  findOne: jest.Mock;
  findById: jest.Mock;
  findByIdAndUpdate: jest.Mock;
  findOneAndDelete: jest.Mock;
};

const mockedPasscodeModel = PostCreationPasscode as unknown as {
  countDocuments: jest.Mock;
  updateMany: jest.Mock;
  create: jest.Mock;
  findByIdAndDelete: jest.Mock;
  findOne: jest.Mock;
};

const mockedUser = User as unknown as {
  findById: jest.Mock;
};

const mockedSendPostPasscodeEmail = sendPostPasscodeEmail as jest.Mock;
const mockedPostService = postService as {
  runAIModerationJob: jest.Mock;
  getAdminPostList: jest.Mock;
};

function createResponse(): Response {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return res as unknown as Response;
}

function createAuthRequest(
  overrides: Partial<Request> & { user?: { id: string; role: string } } = {},
): Request {
  return {
    user: { id: '507f191e810c19729de860ea', role: 'USER' },
    body: {},
    params: {},
    query: {},
    headers: {},
    ...overrides,
  } as unknown as Request;
}

// =============================================
// sendCreatePostPasscode
// =============================================
describe('sendCreatePostPasscode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedPasscodeModel.countDocuments.mockResolvedValue(0);
    mockedPasscodeModel.updateMany.mockResolvedValue(undefined);
    mockedPasscodeModel.findByIdAndDelete.mockResolvedValue(undefined);
    mockedSendPostPasscodeEmail.mockResolvedValue(undefined);
  });

  it('sends passcode email successfully', async () => {
    const req = createAuthRequest();
    const res = createResponse();

    mockedUser.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({ email: 'user@example.com' }),
    });
    mockedPasscodeModel.create.mockResolvedValue({ _id: 'passcode-doc-id' });

    await sendCreatePostPasscode(req, res);

    expect(mockedPasscodeModel.countDocuments).toHaveBeenCalled();
    expect(mockedPasscodeModel.updateMany).toHaveBeenCalled();
    expect(mockedPasscodeModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: '507f191e810c19729de860ea',
        code: expect.stringMatching(/^\d{6}$/),
      }),
    );
    expect(mockedSendPostPasscodeEmail).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'user@example.com' }),
    );
    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(200);
  });

  it('returns 401 when user is not authenticated', async () => {
    const req = createAuthRequest({ user: undefined });
    const res = createResponse();

    await sendCreatePostPasscode(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(401);
  });

  it('returns 404 when user not found', async () => {
    const req = createAuthRequest();
    const res = createResponse();

    mockedUser.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue(null),
    });

    await sendCreatePostPasscode(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(404);
  });

  it('returns 429 when rate limit exceeded', async () => {
    const req = createAuthRequest();
    const res = createResponse();

    mockedUser.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({ email: 'user@example.com' }),
    });
    mockedPasscodeModel.countDocuments.mockResolvedValue(3);

    await sendCreatePostPasscode(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(429);
  });

  it('rolls back saved passcode when email send fails', async () => {
    const req = createAuthRequest();
    const res = createResponse();

    mockedUser.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({ email: 'user@example.com' }),
    });
    mockedPasscodeModel.create.mockResolvedValue({ _id: 'passcode-doc-id' });
    mockedSendPostPasscodeEmail.mockRejectedValue(new Error('SMTP error'));

    await sendCreatePostPasscode(req, res);

    expect(mockedPasscodeModel.findByIdAndDelete).toHaveBeenCalledWith(
      'passcode-doc-id',
    );
    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(500);
  });
});

// =============================================
// createPost
// =============================================
describe('createPost', () => {
  const validBody = {
    type: 'P2P_FREE',
    category: 'FOOD',
    title: 'Com hop',
    description: 'Com hop con moi',
    images: ['https://image.test/1.png'],
    totalQuantity: 5,
    price: 0,
    expiryDate: '2026-03-31T10:00:00.000Z',
    pickupTime: '17:00-19:00',
    location: { type: 'Point', coordinates: [106.7, 10.7] },
    publishAt: '2026-03-24T10:00:00.000Z',
    passcode: '123456',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates post successfully when passcode is valid', async () => {
    const req = createAuthRequest({ body: validBody });
    const res = createResponse();

    const save = jest.fn().mockResolvedValue(undefined);
    const passcodeRecord = { usedAt: null, save };

    mockedPasscodeModel.findOne.mockReturnValue({
      sort: jest.fn().mockResolvedValue(passcodeRecord),
    });
    mockedPost.create.mockResolvedValue({ _id: 'post-id-1', title: 'Com hop' });

    await createPost(req, res);

    expect(mockedPasscodeModel.findOne).toHaveBeenCalled();
    expect(mockedPost.create).toHaveBeenCalled();
    expect(save).toHaveBeenCalled();
    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(201);
    expect(mockedPostService.runAIModerationJob).toHaveBeenCalledWith(
      'post-id-1',
    );
  });

  it('returns 401 when not authenticated', async () => {
    const req = createAuthRequest({ user: undefined, body: validBody });
    const res = createResponse();

    await createPost(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(401);
  });

  it('returns 400 when required fields are missing', async () => {
    const req = createAuthRequest({
      body: { ...validBody, title: '', images: [] },
    });
    const res = createResponse();

    await createPost(req, res);

    expect(mockedPost.create).not.toHaveBeenCalled();
    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(400);
  });

  it('returns 400 when passcode format is invalid', async () => {
    const req = createAuthRequest({
      body: { ...validBody, passcode: '12AB56' },
    });
    const res = createResponse();

    await createPost(req, res);

    expect(mockedPasscodeModel.findOne).not.toHaveBeenCalled();
    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(400);
  });

  it('returns 400 when passcode is expired or not found', async () => {
    const req = createAuthRequest({ body: validBody });
    const res = createResponse();

    mockedPasscodeModel.findOne.mockReturnValue({
      sort: jest.fn().mockResolvedValue(null),
    });

    await createPost(req, res);

    expect(mockedPost.create).not.toHaveBeenCalled();
    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(400);
    expect(res.json as unknown as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: 'Passcode không hợp lệ hoặc đã hết hạn',
      }),
    );
  });

  it('forces price=0 for P2P_FREE type', async () => {
    const req = createAuthRequest({
      body: { ...validBody, type: 'P2P_FREE', price: 50000 },
    });
    const res = createResponse();

    const save = jest.fn().mockResolvedValue(undefined);
    mockedPasscodeModel.findOne.mockReturnValue({
      sort: jest.fn().mockResolvedValue({ usedAt: null, save }),
    });
    mockedPost.create.mockResolvedValue({ _id: 'post-id-2' });

    await createPost(req, res);

    expect(mockedPost.create).toHaveBeenCalledWith(
      expect.objectContaining({ price: 0 }),
    );
  });
});

// =============================================
// getMyPosts
// =============================================
describe('getMyPosts', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns posts for authenticated user', async () => {
    const req = createAuthRequest();
    const res = createResponse();

    const mockPosts = [{ _id: '1', title: 'Post 1' }];
    mockedPost.find.mockReturnValue({
      sort: jest.fn().mockResolvedValue(mockPosts),
    });

    await getMyPosts(req, res);

    expect(mockedPost.find).toHaveBeenCalledWith({
      ownerId: '507f191e810c19729de860ea',
    });
    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(200);
    expect(res.json as unknown as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: mockPosts }),
    );
  });
});

// =============================================
// updatePost
// =============================================
describe('updatePost', () => {
  beforeEach(() => jest.clearAllMocks());

  it('updates post successfully', async () => {
    const req = createAuthRequest({
      params: { id: '507f191e810c19729de860eb' },
      body: { category: 'BAKERY' },
    });
    const res = createResponse();

    mockedPost.findOne.mockResolvedValue({ _id: '507f191e810c19729de860eb' });
    mockedPost.findByIdAndUpdate.mockResolvedValue({
      _id: '507f191e810c19729de860eb',
      category: 'BAKERY',
    });

    await updatePost(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(200);
    expect(mockedPostService.runAIModerationJob).not.toHaveBeenCalled();
  });

  it('re-triggers AI moderation when sensitive field is updated', async () => {
    const req = createAuthRequest({
      params: { id: '507f191e810c19729de860eb' },
      body: { title: 'Updated title' },
    });
    const res = createResponse();

    mockedPost.findOne.mockResolvedValue({ _id: '507f191e810c19729de860eb' });
    mockedPost.findByIdAndUpdate.mockResolvedValue({
      _id: '507f191e810c19729de860eb',
      title: 'Updated title',
    });

    await updatePost(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(200);
    expect(mockedPostService.runAIModerationJob).toHaveBeenCalledWith(
      '507f191e810c19729de860eb',
    );
  });

  it('returns 404 when post not found or not owned', async () => {
    const req = createAuthRequest({
      params: { id: '507f191e810c19729de860eb' },
      body: { category: 'BAKERY' },
    });
    const res = createResponse();

    mockedPost.findOne.mockResolvedValue(null);

    await updatePost(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(404);
  });
});

// =============================================
// deletePost
// =============================================
describe('deletePost', () => {
  beforeEach(() => jest.clearAllMocks());

  it('deletes post successfully', async () => {
    const req = createAuthRequest({
      params: { id: '507f191e810c19729de860eb' },
    });
    const res = createResponse();

    mockedPost.findOneAndDelete.mockResolvedValue({ _id: '507f191e810c19729de860eb' });

    await deletePost(req, res);

    expect(mockedPost.findOneAndDelete).toHaveBeenCalledWith({
      _id: '507f191e810c19729de860eb',
      ownerId: '507f191e810c19729de860ea',
    });
    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(200);
    expect(res.json as unknown as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({ success: true }),
    );
  });

  it('returns 404 when post not found or not owned', async () => {
    const req = createAuthRequest({
      params: { id: '507f191e810c19729de860eb' },
    });
    const res = createResponse();

    mockedPost.findOneAndDelete.mockResolvedValue(null);

    await deletePost(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(404);
  });
});

// =============================================
// getPostDetail
// =============================================
describe('getPostDetail', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns post detail for AVAILABLE post', async () => {
    const req = createAuthRequest({
      user: undefined,
      params: { id: '507f191e810c19729de860eb' },
    });
    const res = createResponse();

    const mockPost = {
      _id: '507f191e810c19729de860eb',
      status: 'AVAILABLE',
      ownerId: { _id: 'owner-1' },
    };
    mockedPost.findById.mockReturnValue({
      populate: jest.fn().mockResolvedValue(mockPost),
    });

    await getPostDetail(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(200);
    expect(res.json as unknown as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: mockPost }),
    );
  });

  it('returns 404 for HIDDEN post when not owner', async () => {
    const req = createAuthRequest({
      user: { id: 'other-user', role: 'USER' },
      params: { id: '507f191e810c19729de860eb' },
    });
    const res = createResponse();

    const mockPost = {
      _id: '507f191e810c19729de860eb',
      status: 'HIDDEN',
      ownerId: { _id: 'owner-1' },
    };
    mockedPost.findById.mockReturnValue({
      populate: jest.fn().mockResolvedValue(mockPost),
    });

    await getPostDetail(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(404);
  });

  it('allows owner to view PENDING_REVIEW post', async () => {
    const ownerId = '507f191e810c19729de860ea';
    const req = createAuthRequest({
      user: { id: ownerId, role: 'USER' },
      params: { id: '507f191e810c19729de860eb' },
    });
    const res = createResponse();

    const mockPost = {
      _id: '507f191e810c19729de860eb',
      status: 'PENDING_REVIEW',
      ownerId: { _id: ownerId },
    };
    mockedPost.findById.mockReturnValue({
      populate: jest.fn().mockResolvedValue(mockPost),
    });

    await getPostDetail(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(200);
  });

  it('returns 400 for invalid ObjectId', async () => {
    const req = createAuthRequest({
      params: { id: 'not-a-valid-id' },
    });
    const res = createResponse();

    await getPostDetail(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(400);
  });

  it('returns 404 when post does not exist', async () => {
    const req = createAuthRequest({
      params: { id: '507f191e810c19729de860eb' },
    });
    const res = createResponse();

    mockedPost.findById.mockReturnValue({
      populate: jest.fn().mockResolvedValue(null),
    });

    await getPostDetail(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(404);
  });
});

// =============================================
// searchMapPosts
// =============================================
describe('searchMapPosts', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns nearby AVAILABLE posts', async () => {
    const req = createAuthRequest({
      user: undefined,
      query: { lng: '106.7', lat: '10.7' },
    });
    const res = createResponse();

    const mockPosts = [{ _id: '1', title: 'Nearby post' }];
    mockedPost.find.mockReturnValue({
      populate: jest.fn().mockReturnValue({
        sort: jest.fn().mockResolvedValue(mockPosts),
      }),
    });

    await searchMapPosts(req, res);

    expect(mockedPost.find).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'AVAILABLE' }),
    );
    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(200);
  });

  it('returns 400 when lng/lat are missing', async () => {
    const req = createAuthRequest({
      user: undefined,
      query: {},
    });
    const res = createResponse();

    await searchMapPosts(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(400);
  });
});

// =============================================
// adminGetPosts
// =============================================
describe('adminGetPosts', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns paginated post list for admin', async () => {
    const req = createAuthRequest({
      user: { id: 'admin-1', role: 'ADMIN' },
      query: { status: 'PENDING_REVIEW', page: '1', limit: '10' },
    });
    const res = createResponse();

    const mockResult = {
      posts: [{ _id: '1' }],
      pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
    };
    mockedPostService.getAdminPostList.mockResolvedValue(mockResult);

    await adminGetPosts(req, res);

    expect(mockedPostService.getAdminPostList).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'PENDING_REVIEW', page: 1, limit: 10 }),
    );
    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(200);
    expect(res.json as unknown as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        pagination: mockResult.pagination,
      }),
    );
  });
});

// =============================================
// adminUpdatePost
// =============================================
describe('adminUpdatePost', () => {
  beforeEach(() => jest.clearAllMocks());

  it('admin updates post successfully', async () => {
    const req = createAuthRequest({
      user: { id: 'admin-1', role: 'ADMIN' },
      params: { id: '507f191e810c19729de860eb' },
      body: { status: 'AVAILABLE' },
    });
    const res = createResponse();

    mockedPost.findByIdAndUpdate.mockResolvedValue({
      _id: '507f191e810c19729de860eb',
      status: 'AVAILABLE',
    });

    await adminUpdatePost(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(200);
  });

  it('returns 404 when post not found', async () => {
    const req = createAuthRequest({
      user: { id: 'admin-1', role: 'ADMIN' },
      params: { id: '507f191e810c19729de860eb' },
      body: { status: 'AVAILABLE' },
    });
    const res = createResponse();

    mockedPost.findByIdAndUpdate.mockResolvedValue(null);

    await adminUpdatePost(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(404);
  });

  it('returns 400 for invalid ObjectId', async () => {
    const req = createAuthRequest({
      user: { id: 'admin-1', role: 'ADMIN' },
      params: { id: 'invalid-id' },
      body: { status: 'AVAILABLE' },
    });
    const res = createResponse();

    await adminUpdatePost(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(400);
  });
});

// =============================================
// adminToggleHidePost
// =============================================
describe('adminToggleHidePost', () => {
  beforeEach(() => jest.clearAllMocks());

  it('hides post successfully', async () => {
    const req = createAuthRequest({
      user: { id: 'admin-1', role: 'ADMIN' },
      params: { id: '507f191e810c19729de860eb' },
    });
    const res = createResponse();

    const mockPost = {
      _id: '507f191e810c19729de860eb',
      status: 'AVAILABLE',
      save: jest.fn().mockResolvedValue(undefined),
    };
    mockedPost.findById.mockResolvedValue(mockPost);

    await adminToggleHidePost(req, res);

    expect(mockPost.status).toBe('HIDDEN');
    expect(mockPost.save).toHaveBeenCalled();
    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(200);
  });

  it('returns 404 when post not found', async () => {
    const req = createAuthRequest({
      user: { id: 'admin-1', role: 'ADMIN' },
      params: { id: '507f191e810c19729de860eb' },
    });
    const res = createResponse();

    mockedPost.findById.mockResolvedValue(null);

    await adminToggleHidePost(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(404);
  });

  it('returns 400 for invalid ObjectId', async () => {
    const req = createAuthRequest({
      user: { id: 'admin-1', role: 'ADMIN' },
      params: { id: 'bad-id' },
    });
    const res = createResponse();

    await adminToggleHidePost(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(400);
  });
});

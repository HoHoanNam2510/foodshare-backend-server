import { Request, Response } from 'express';

import {
  createReview,
  getUserReviews,
  getMyWrittenReviews,
  updateMyReview,
  deleteMyReview,
  adminGetReviews,
  adminDeleteReview,
} from '@/controllers/reviewController';
import * as reviewService from '@/services/reviewService';

jest.mock('@/services/reviewService', () => ({
  __esModule: true,
  ReviewServiceError: class ReviewServiceError extends Error {
    public statusCode: number;
    constructor(message: string, statusCode: number) {
      super(message);
      this.statusCode = statusCode;
    }
  },
  createReview: jest.fn(),
  getUserReviews: jest.fn(),
  getMyWrittenReviews: jest.fn(),
  updateMyReview: jest.fn(),
  deleteMyReview: jest.fn(),
  adminGetReviews: jest.fn(),
  adminDeleteReview: jest.fn(),
}));

// =============================================
// Helpers
// =============================================

const mockedService = reviewService as unknown as {
  createReview: jest.Mock;
  getUserReviews: jest.Mock;
  getMyWrittenReviews: jest.Mock;
  updateMyReview: jest.Mock;
  deleteMyReview: jest.Mock;
  adminGetReviews: jest.Mock;
  adminDeleteReview: jest.Mock;
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
const VALID_TRANSACTION_ID = '607f191e810c19729de860eb';
const VALID_REVIEW_ID = '707f191e810c19729de860ec';
const ADMIN_ID = '807f191e810c19729de860ed';
const VALID_REVIEWEE_ID = '907f191e810c19729de860ee';

// =============================================
// createReview
// =============================================
describe('createReview', () => {
  const validBody = {
    transactionId: VALID_TRANSACTION_ID,
    rating: 5,
    feedback: 'Người chia sẻ rất nhiệt tình, thực phẩm còn tốt',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates review successfully and returns 201', async () => {
    const req = createAuthRequest({ body: validBody });
    const res = createResponse();

    const mockReview = {
      _id: VALID_REVIEW_ID,
      transactionId: VALID_TRANSACTION_ID,
      reviewerId: VALID_USER_ID,
      revieweeId: VALID_REVIEWEE_ID,
      rating: 5,
      feedback: validBody.feedback,
    };
    mockedService.createReview.mockResolvedValue(mockReview);

    await createReview(req, res);

    expect(mockedService.createReview).toHaveBeenCalledWith(VALID_USER_ID, {
      transactionId: VALID_TRANSACTION_ID,
      rating: 5,
      feedback: validBody.feedback,
    });
    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(201);
    expect(res.json as unknown as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: mockReview,
      })
    );
  });

  it('returns 401 when user is not authenticated', async () => {
    const req = createAuthRequest({ user: undefined, body: validBody });
    const res = createResponse();

    await createReview(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(401);
    expect(mockedService.createReview).not.toHaveBeenCalled();
  });

  it('returns 404 when transaction does not exist', async () => {
    const req = createAuthRequest({ body: validBody });
    const res = createResponse();

    mockedService.createReview.mockRejectedValue(
      new reviewService.ReviewServiceError('Không tìm thấy giao dịch', 404)
    );

    await createReview(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(404);
  });

  it('returns 400 when transaction is not COMPLETED', async () => {
    const req = createAuthRequest({ body: validBody });
    const res = createResponse();

    mockedService.createReview.mockRejectedValue(
      new reviewService.ReviewServiceError(
        'Chỉ có thể đánh giá giao dịch đã hoàn tất (COMPLETED)',
        400
      )
    );

    await createReview(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(400);
  });

  it('returns 403 when user is not a transaction participant', async () => {
    const req = createAuthRequest({ body: validBody });
    const res = createResponse();

    mockedService.createReview.mockRejectedValue(
      new reviewService.ReviewServiceError(
        'Bạn không có quyền đánh giá giao dịch mà mình không tham gia',
        403
      )
    );

    await createReview(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(403);
  });

  it('returns 409 when user already reviewed this transaction', async () => {
    const req = createAuthRequest({ body: validBody });
    const res = createResponse();

    mockedService.createReview.mockRejectedValue(
      new reviewService.ReviewServiceError(
        'Bạn đã đánh giá giao dịch này rồi',
        409
      )
    );

    await createReview(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(409);
  });

  it('returns 500 on unexpected error without leaking details', async () => {
    const req = createAuthRequest({ body: validBody });
    const res = createResponse();

    mockedService.createReview.mockRejectedValue(
      new Error('DB connection lost')
    );

    await createReview(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(500);
    const jsonCall = (res.json as unknown as jest.Mock).mock.calls[0][0];
    expect(jsonCall.success).toBe(false);
    expect(jsonCall.error).toBeUndefined();
    expect(jsonCall.message).toBe('Đã xảy ra lỗi từ phía server');
  });
});

// =============================================
// getUserReviews
// =============================================
describe('getUserReviews', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns user reviews with pagination and 200', async () => {
    const req = createAuthRequest({
      params: { userId: VALID_REVIEWEE_ID },
      query: { page: '1', limit: '10' },
    });
    const res = createResponse();

    const mockResult = {
      data: [{ _id: '1', rating: 5 }],
      pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
    };
    mockedService.getUserReviews.mockResolvedValue(mockResult);

    await getUserReviews(req, res);

    expect(mockedService.getUserReviews).toHaveBeenCalledWith(
      VALID_REVIEWEE_ID,
      { page: 1, limit: 10, sort: undefined }
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

  it('passes sort filter from query', async () => {
    const req = createAuthRequest({
      params: { userId: VALID_REVIEWEE_ID },
      query: { sort: '1' },
    });
    const res = createResponse();

    mockedService.getUserReviews.mockResolvedValue({
      data: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });

    await getUserReviews(req, res);

    expect(mockedService.getUserReviews).toHaveBeenCalledWith(
      VALID_REVIEWEE_ID,
      expect.objectContaining({ sort: '1' })
    );
  });

  it('returns 400 when userId is invalid', async () => {
    const req = createAuthRequest({
      params: { userId: 'invalid-id' },
      query: {},
    });
    const res = createResponse();

    mockedService.getUserReviews.mockRejectedValue(
      new reviewService.ReviewServiceError('User ID không hợp lệ', 400)
    );

    await getUserReviews(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(400);
  });
});

// =============================================
// getMyWrittenReviews
// =============================================
describe('getMyWrittenReviews', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns written reviews with pagination and 200', async () => {
    const req = createAuthRequest({
      query: { page: '1', limit: '10' },
    });
    const res = createResponse();

    const mockResult = {
      data: [{ _id: '1', rating: 4, revieweeId: VALID_REVIEWEE_ID }],
      pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
    };
    mockedService.getMyWrittenReviews.mockResolvedValue(mockResult);

    await getMyWrittenReviews(req, res);

    expect(mockedService.getMyWrittenReviews).toHaveBeenCalledWith(
      VALID_USER_ID,
      { page: 1, limit: 10 }
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

  it('returns 401 when user is not authenticated', async () => {
    const req = createAuthRequest({ user: undefined });
    const res = createResponse();

    await getMyWrittenReviews(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(401);
    expect(mockedService.getMyWrittenReviews).not.toHaveBeenCalled();
  });

  it('uses defaults when page/limit not provided', async () => {
    const req = createAuthRequest({ query: {} });
    const res = createResponse();

    mockedService.getMyWrittenReviews.mockResolvedValue({
      data: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });

    await getMyWrittenReviews(req, res);

    expect(mockedService.getMyWrittenReviews).toHaveBeenCalledWith(
      VALID_USER_ID,
      { page: undefined, limit: undefined }
    );
  });
});

// =============================================
// updateMyReview
// =============================================
describe('updateMyReview', () => {
  const validBody = { rating: 4, feedback: 'Sửa lại đánh giá' };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('updates review successfully and returns 200', async () => {
    const req = createAuthRequest({
      params: { reviewId: VALID_REVIEW_ID },
      body: validBody,
    });
    const res = createResponse();

    const mockReview = { _id: VALID_REVIEW_ID, ...validBody };
    mockedService.updateMyReview.mockResolvedValue(mockReview);

    await updateMyReview(req, res);

    expect(mockedService.updateMyReview).toHaveBeenCalledWith(
      VALID_USER_ID,
      VALID_REVIEW_ID,
      { rating: 4, feedback: 'Sửa lại đánh giá' }
    );
    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(200);
    expect(res.json as unknown as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: 'Cập nhật đánh giá thành công',
        data: mockReview,
      })
    );
  });

  it('returns 401 when user is not authenticated', async () => {
    const req = createAuthRequest({
      user: undefined,
      params: { reviewId: VALID_REVIEW_ID },
      body: validBody,
    });
    const res = createResponse();

    await updateMyReview(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(401);
    expect(mockedService.updateMyReview).not.toHaveBeenCalled();
  });

  it('returns 404 when review not found', async () => {
    const req = createAuthRequest({
      params: { reviewId: VALID_REVIEW_ID },
      body: validBody,
    });
    const res = createResponse();

    mockedService.updateMyReview.mockRejectedValue(
      new reviewService.ReviewServiceError('Không tìm thấy bài đánh giá', 404)
    );

    await updateMyReview(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(404);
  });

  it('returns 403 when user does not own the review', async () => {
    const req = createAuthRequest({
      params: { reviewId: VALID_REVIEW_ID },
      body: validBody,
    });
    const res = createResponse();

    mockedService.updateMyReview.mockRejectedValue(
      new reviewService.ReviewServiceError(
        'Bạn không có quyền chỉnh sửa đánh giá này',
        403
      )
    );

    await updateMyReview(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(403);
  });
});

// =============================================
// deleteMyReview
// =============================================
describe('deleteMyReview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('deletes review successfully and returns 200', async () => {
    const req = createAuthRequest({
      params: { reviewId: VALID_REVIEW_ID },
    });
    const res = createResponse();

    mockedService.deleteMyReview.mockResolvedValue(undefined);

    await deleteMyReview(req, res);

    expect(mockedService.deleteMyReview).toHaveBeenCalledWith(
      VALID_USER_ID,
      VALID_REVIEW_ID
    );
    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(200);
    expect(res.json as unknown as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: 'Xóa đánh giá thành công',
      })
    );
  });

  it('returns 401 when user is not authenticated', async () => {
    const req = createAuthRequest({
      user: undefined,
      params: { reviewId: VALID_REVIEW_ID },
    });
    const res = createResponse();

    await deleteMyReview(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(401);
    expect(mockedService.deleteMyReview).not.toHaveBeenCalled();
  });

  it('returns 404 when review not found', async () => {
    const req = createAuthRequest({
      params: { reviewId: VALID_REVIEW_ID },
    });
    const res = createResponse();

    mockedService.deleteMyReview.mockRejectedValue(
      new reviewService.ReviewServiceError('Không tìm thấy bài đánh giá', 404)
    );

    await deleteMyReview(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(404);
  });

  it('returns 403 when user does not own the review', async () => {
    const req = createAuthRequest({
      params: { reviewId: VALID_REVIEW_ID },
    });
    const res = createResponse();

    mockedService.deleteMyReview.mockRejectedValue(
      new reviewService.ReviewServiceError(
        'Bạn không có quyền xóa đánh giá này',
        403
      )
    );

    await deleteMyReview(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(403);
  });
});

// =============================================
// adminGetReviews
// =============================================
describe('adminGetReviews', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns paginated reviews with 200', async () => {
    const req = createAuthRequest({
      user: { id: ADMIN_ID, role: 'ADMIN' },
      query: { rating: '1', page: '1', limit: '10' },
    });
    const res = createResponse();

    const mockResult = {
      data: [{ _id: '1', rating: 1 }],
      pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
    };
    mockedService.adminGetReviews.mockResolvedValue(mockResult);

    await adminGetReviews(req, res);

    expect(mockedService.adminGetReviews).toHaveBeenCalledWith({
      rating: 1,
      revieweeId: undefined,
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

  it('passes all filter params to service', async () => {
    const req = createAuthRequest({
      user: { id: ADMIN_ID, role: 'ADMIN' },
      query: {
        rating: '5',
        revieweeId: VALID_REVIEWEE_ID,
        page: '2',
        limit: '5',
      },
    });
    const res = createResponse();

    mockedService.adminGetReviews.mockResolvedValue({
      data: [],
      pagination: { page: 2, limit: 5, total: 0, totalPages: 0 },
    });

    await adminGetReviews(req, res);

    expect(mockedService.adminGetReviews).toHaveBeenCalledWith({
      rating: 5,
      revieweeId: VALID_REVIEWEE_ID,
      page: 2,
      limit: 5,
    });
  });

  it('uses defaults when query params not provided', async () => {
    const req = createAuthRequest({
      user: { id: ADMIN_ID, role: 'ADMIN' },
      query: {},
    });
    const res = createResponse();

    mockedService.adminGetReviews.mockResolvedValue({
      data: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });

    await adminGetReviews(req, res);

    expect(mockedService.adminGetReviews).toHaveBeenCalledWith({
      rating: undefined,
      revieweeId: undefined,
      page: undefined,
      limit: undefined,
    });
  });
});

// =============================================
// adminDeleteReview
// =============================================
describe('adminDeleteReview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('deletes review and returns updated averageRating with 200', async () => {
    const req = createAuthRequest({
      user: { id: ADMIN_ID, role: 'ADMIN' },
      params: { reviewId: VALID_REVIEW_ID },
    });
    const res = createResponse();

    mockedService.adminDeleteReview.mockResolvedValue({
      deletedRevieweeId: VALID_REVIEWEE_ID,
      newAverageRating: 4.5,
    });

    await adminDeleteReview(req, res);

    expect(mockedService.adminDeleteReview).toHaveBeenCalledWith(
      VALID_REVIEW_ID
    );
    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(200);
    expect(res.json as unknown as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: 'Đã xóa đánh giá và cập nhật điểm trung bình thành công',
        data: {
          revieweeId: VALID_REVIEWEE_ID,
          newAverageRating: 4.5,
        },
      })
    );
  });

  it('returns 404 when review not found', async () => {
    const req = createAuthRequest({
      user: { id: ADMIN_ID, role: 'ADMIN' },
      params: { reviewId: VALID_REVIEW_ID },
    });
    const res = createResponse();

    mockedService.adminDeleteReview.mockRejectedValue(
      new reviewService.ReviewServiceError('Không tìm thấy bài đánh giá', 404)
    );

    await adminDeleteReview(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(404);
  });

  it('returns 400 when review ID is invalid', async () => {
    const req = createAuthRequest({
      user: { id: ADMIN_ID, role: 'ADMIN' },
      params: { reviewId: 'invalid-id' },
    });
    const res = createResponse();

    mockedService.adminDeleteReview.mockRejectedValue(
      new reviewService.ReviewServiceError('Review ID không hợp lệ', 400)
    );

    await adminDeleteReview(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(400);
  });

  it('returns 500 on unexpected error without leaking details', async () => {
    const req = createAuthRequest({
      user: { id: ADMIN_ID, role: 'ADMIN' },
      params: { reviewId: VALID_REVIEW_ID },
    });
    const res = createResponse();

    mockedService.adminDeleteReview.mockRejectedValue(
      new Error('MongoDB timeout')
    );

    await adminDeleteReview(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(500);
    const jsonCall = (res.json as unknown as jest.Mock).mock.calls[0][0];
    expect(jsonCall.success).toBe(false);
    expect(jsonCall.error).toBeUndefined();
    expect(jsonCall.message).toBe('Đã xảy ra lỗi từ phía server');
  });
});

import { Request, Response } from 'express';

import { getPointHistory } from '@/controllers/greenPointController';
import * as greenPointService from '@/services/greenPointService';

jest.mock('@/services/greenPointService', () => ({
  __esModule: true,
  GreenPointServiceError: class GreenPointServiceError extends Error {
    public statusCode: number;
    constructor(message: string, statusCode: number) {
      super(message);
      this.statusCode = statusCode;
    }
  },
  getPointHistory: jest.fn(),
}));

// =============================================
// Helpers
// =============================================

const mockedService = greenPointService as unknown as {
  getPointHistory: jest.Mock;
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

// =============================================
// getPointHistory
// =============================================
describe('getPointHistory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns point history with greenPoints and pagination with 200', async () => {
    const req = createAuthRequest({
      query: { page: '1', limit: '10' },
    });
    const res = createResponse();

    const mockResult = {
      greenPoints: 150,
      logs: [
        { _id: 'log1', amount: 10, reason: 'Hoàn tất giao dịch P2P' },
        { _id: 'log2', amount: -100, reason: 'Đổi điểm lấy Voucher' },
      ],
      pagination: { page: 1, limit: 10, total: 2, totalPages: 1 },
    };
    mockedService.getPointHistory.mockResolvedValue(mockResult);

    await getPointHistory(req, res);

    expect(mockedService.getPointHistory).toHaveBeenCalledWith(VALID_USER_ID, {
      page: 1,
      limit: 10,
    });
    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(200);
    expect(res.json as unknown as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: {
          greenPoints: 150,
          logs: mockResult.logs,
        },
        pagination: mockResult.pagination,
      })
    );
  });

  it('handles empty query params with defaults', async () => {
    const req = createAuthRequest({ query: {} });
    const res = createResponse();

    mockedService.getPointHistory.mockResolvedValue({
      greenPoints: 0,
      logs: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });

    await getPointHistory(req, res);

    expect(mockedService.getPointHistory).toHaveBeenCalledWith(VALID_USER_ID, {
      page: undefined,
      limit: undefined,
    });
  });

  it('returns 401 when user is not authenticated', async () => {
    const req = createAuthRequest({ user: undefined });
    const res = createResponse();

    await getPointHistory(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(401);
    expect(mockedService.getPointHistory).not.toHaveBeenCalled();
  });

  it('returns 404 when user not found', async () => {
    const req = createAuthRequest();
    const res = createResponse();

    mockedService.getPointHistory.mockRejectedValue(
      new greenPointService.GreenPointServiceError(
        'Không tìm thấy người dùng',
        404
      )
    );

    await getPointHistory(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(404);
  });

  it('returns 400 when user ID is invalid', async () => {
    const req = createAuthRequest();
    const res = createResponse();

    mockedService.getPointHistory.mockRejectedValue(
      new greenPointService.GreenPointServiceError('User ID không hợp lệ', 400)
    );

    await getPointHistory(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(400);
  });

  it('returns 500 on unexpected error without leaking details', async () => {
    const req = createAuthRequest();
    const res = createResponse();

    mockedService.getPointHistory.mockRejectedValue(
      new Error('MongoDB timeout')
    );

    await getPointHistory(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(500);
    const jsonCall = (res.json as unknown as jest.Mock).mock.calls[0][0];
    expect(jsonCall.success).toBe(false);
    expect(jsonCall.message).toBe('Đã xảy ra lỗi từ phía server');
  });
});

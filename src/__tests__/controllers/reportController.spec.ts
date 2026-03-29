import { Request, Response } from 'express';

import {
  createReport,
  getMyReports,
  adminGetReports,
  adminGetReportDetail,
  adminProcessReport,
} from '@/controllers/reportController';
import * as reportService from '@/services/reportService';

jest.mock('@/services/reportService', () => ({
  __esModule: true,
  ReportServiceError: class ReportServiceError extends Error {
    public statusCode: number;
    constructor(message: string, statusCode: number) {
      super(message);
      this.statusCode = statusCode;
    }
  },
  createReport: jest.fn(),
  getMyReports: jest.fn(),
  adminGetReports: jest.fn(),
  adminGetReportDetail: jest.fn(),
  adminProcessReport: jest.fn(),
}));

// =============================================
// Helpers
// =============================================

const mockedService = reportService as unknown as {
  createReport: jest.Mock;
  getMyReports: jest.Mock;
  adminGetReports: jest.Mock;
  adminGetReportDetail: jest.Mock;
  adminProcessReport: jest.Mock;
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
    user: { id: '507f191e810c19729de860ea', role: 'USER' },
    body: {},
    params: {},
    query: {},
    headers: {},
    ...overrides,
  } as unknown as Request;
}

const VALID_USER_ID = '507f191e810c19729de860ea';
const VALID_TARGET_ID = '607f191e810c19729de860eb';
const VALID_REPORT_ID = '707f191e810c19729de860ec';
const ADMIN_ID = '807f191e810c19729de860ed';

// =============================================
// createReport
// =============================================
describe('createReport', () => {
  const validBody = {
    targetType: 'POST',
    targetId: VALID_TARGET_ID,
    reason: 'FOOD_SAFETY',
    description: 'Thực phẩm đã hết hạn sử dụng, có mùi hôi',
    images: ['https://img.test/evidence1.png'],
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates report successfully and returns 201', async () => {
    const req = createAuthRequest({ body: validBody });
    const res = createResponse();

    const mockReport = {
      _id: VALID_REPORT_ID,
      ...validBody,
      status: 'PENDING',
    };
    mockedService.createReport.mockResolvedValue(mockReport);

    await createReport(req, res);

    expect(mockedService.createReport).toHaveBeenCalledWith(VALID_USER_ID, {
      targetType: 'POST',
      targetId: VALID_TARGET_ID,
      reason: 'FOOD_SAFETY',
      description: 'Thực phẩm đã hết hạn sử dụng, có mùi hôi',
      images: ['https://img.test/evidence1.png'],
    });
    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(201);
    expect(res.json as unknown as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: mockReport,
      })
    );
  });

  it('returns 401 when user is not authenticated', async () => {
    const req = createAuthRequest({ user: undefined });
    const res = createResponse();

    await createReport(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(401);
    expect(mockedService.createReport).not.toHaveBeenCalled();
  });

  it('returns 404 when target does not exist', async () => {
    const req = createAuthRequest({ body: validBody });
    const res = createResponse();

    mockedService.createReport.mockRejectedValue(
      new reportService.ReportServiceError(
        'Không tìm thấy POST với ID: ' + VALID_TARGET_ID,
        404
      )
    );

    await createReport(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(404);
  });

  it('returns 403 when reporter is not a transaction participant', async () => {
    const body = { ...validBody, targetType: 'TRANSACTION' };
    const req = createAuthRequest({ body });
    const res = createResponse();

    mockedService.createReport.mockRejectedValue(
      new reportService.ReportServiceError(
        'Bạn không có quyền report giao dịch mà mình không tham gia',
        403
      )
    );

    await createReport(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(403);
  });

  it('returns 500 on unexpected error without leaking details', async () => {
    const req = createAuthRequest({ body: validBody });
    const res = createResponse();

    mockedService.createReport.mockRejectedValue(
      new Error('DB connection lost')
    );

    await createReport(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(500);
    const jsonCall = (res.json as unknown as jest.Mock).mock.calls[0][0];
    expect(jsonCall.success).toBe(false);
    // Không được leak error message nội bộ
    expect(jsonCall.error).toBeUndefined();
    expect(jsonCall.message).toBe('Đã xảy ra lỗi từ phía server');
  });
});

// =============================================
// getMyReports
// =============================================
describe('getMyReports', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns user reports successfully with 200', async () => {
    const req = createAuthRequest({ query: {} });
    const res = createResponse();

    const mockReports = [
      { _id: '1', status: 'PENDING' },
      { _id: '2', status: 'RESOLVED' },
    ];
    mockedService.getMyReports.mockResolvedValue(mockReports);

    await getMyReports(req, res);

    expect(mockedService.getMyReports).toHaveBeenCalledWith(
      VALID_USER_ID,
      undefined
    );
    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(200);
    expect(res.json as unknown as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: mockReports })
    );
  });

  it('passes status filter from query', async () => {
    const req = createAuthRequest({ query: { status: 'PENDING' } });
    const res = createResponse();

    mockedService.getMyReports.mockResolvedValue([]);

    await getMyReports(req, res);

    expect(mockedService.getMyReports).toHaveBeenCalledWith(
      VALID_USER_ID,
      'PENDING'
    );
  });

  it('returns 401 when user is not authenticated', async () => {
    const req = createAuthRequest({ user: undefined });
    const res = createResponse();

    await getMyReports(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(401);
    expect(mockedService.getMyReports).not.toHaveBeenCalled();
  });
});

// =============================================
// adminGetReports
// =============================================
describe('adminGetReports', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns paginated reports with 200', async () => {
    const req = createAuthRequest({
      user: { id: ADMIN_ID, role: 'ADMIN' },
      query: { status: 'PENDING', page: '1', limit: '10' },
    });
    const res = createResponse();

    const mockResult = {
      data: [{ _id: '1' }],
      pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
    };
    mockedService.adminGetReports.mockResolvedValue(mockResult);

    await adminGetReports(req, res);

    expect(mockedService.adminGetReports).toHaveBeenCalledWith({
      status: 'PENDING',
      targetType: undefined,
      reason: undefined,
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
        status: 'RESOLVED',
        targetType: 'USER',
        reason: 'SCAM',
        page: '2',
        limit: '5',
      },
    });
    const res = createResponse();

    mockedService.adminGetReports.mockResolvedValue({
      data: [],
      pagination: { page: 2, limit: 5, total: 0, totalPages: 0 },
    });

    await adminGetReports(req, res);

    expect(mockedService.adminGetReports).toHaveBeenCalledWith({
      status: 'RESOLVED',
      targetType: 'USER',
      reason: 'SCAM',
      page: 2,
      limit: 5,
    });
  });

  it('uses defaults when page/limit not provided', async () => {
    const req = createAuthRequest({
      user: { id: ADMIN_ID, role: 'ADMIN' },
      query: {},
    });
    const res = createResponse();

    mockedService.adminGetReports.mockResolvedValue({
      data: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });

    await adminGetReports(req, res);

    expect(mockedService.adminGetReports).toHaveBeenCalledWith({
      status: undefined,
      targetType: undefined,
      reason: undefined,
      page: undefined,
      limit: undefined,
    });
  });
});

// =============================================
// adminGetReportDetail
// =============================================
describe('adminGetReportDetail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns report detail with 200', async () => {
    const req = createAuthRequest({
      user: { id: ADMIN_ID, role: 'ADMIN' },
      params: { id: VALID_REPORT_ID },
    });
    const res = createResponse();

    const mockReport = { _id: VALID_REPORT_ID, status: 'PENDING' };
    mockedService.adminGetReportDetail.mockResolvedValue(mockReport);

    await adminGetReportDetail(req, res);

    expect(mockedService.adminGetReportDetail).toHaveBeenCalledWith(
      VALID_REPORT_ID
    );
    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(200);
    expect(res.json as unknown as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: mockReport })
    );
  });

  it('returns 404 when report not found', async () => {
    const req = createAuthRequest({
      user: { id: ADMIN_ID, role: 'ADMIN' },
      params: { id: VALID_REPORT_ID },
    });
    const res = createResponse();

    mockedService.adminGetReportDetail.mockRejectedValue(
      new reportService.ReportServiceError('Không tìm thấy báo cáo', 404)
    );

    await adminGetReportDetail(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(404);
  });

  it('returns 400 when report ID is invalid', async () => {
    const req = createAuthRequest({
      user: { id: ADMIN_ID, role: 'ADMIN' },
      params: { id: 'invalid-id' },
    });
    const res = createResponse();

    mockedService.adminGetReportDetail.mockRejectedValue(
      new reportService.ReportServiceError('Report ID không hợp lệ', 400)
    );

    await adminGetReportDetail(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(400);
  });
});

// =============================================
// adminProcessReport
// =============================================
describe('adminProcessReport', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('processes report with RESOLVED + POST_HIDDEN and returns 200', async () => {
    const body = {
      status: 'RESOLVED',
      actionTaken: 'POST_HIDDEN',
      resolutionNote: 'Bài đăng vi phạm nội quy về an toàn thực phẩm',
    };
    const req = createAuthRequest({
      user: { id: ADMIN_ID, role: 'ADMIN' },
      params: { id: VALID_REPORT_ID },
      body,
    });
    const res = createResponse();

    const mockReport = { _id: VALID_REPORT_ID, status: 'RESOLVED' };
    mockedService.adminProcessReport.mockResolvedValue(mockReport);

    await adminProcessReport(req, res);

    expect(mockedService.adminProcessReport).toHaveBeenCalledWith(
      VALID_REPORT_ID,
      ADMIN_ID,
      {
        status: 'RESOLVED',
        actionTaken: 'POST_HIDDEN',
        resolutionNote: 'Bài đăng vi phạm nội quy về an toàn thực phẩm',
      }
    );
    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(200);
    expect(res.json as unknown as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: 'Phán quyết đã được thực thi thành công',
        data: mockReport,
      })
    );
  });

  it('processes report with DISMISSED and returns 200', async () => {
    const body = {
      status: 'DISMISSED',
      actionTaken: 'NONE',
      resolutionNote: 'Báo cáo không có cơ sở, bác bỏ',
    };
    const req = createAuthRequest({
      user: { id: ADMIN_ID, role: 'ADMIN' },
      params: { id: VALID_REPORT_ID },
      body,
    });
    const res = createResponse();

    const mockReport = { _id: VALID_REPORT_ID, status: 'DISMISSED' };
    mockedService.adminProcessReport.mockResolvedValue(mockReport);

    await adminProcessReport(req, res);

    expect(mockedService.adminProcessReport).toHaveBeenCalledWith(
      VALID_REPORT_ID,
      ADMIN_ID,
      expect.objectContaining({ status: 'DISMISSED' })
    );
    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(200);
  });

  it('returns 401 when admin is not authenticated', async () => {
    const req = createAuthRequest({
      user: undefined,
      params: { id: VALID_REPORT_ID },
      body: {
        status: 'RESOLVED',
        actionTaken: 'USER_BANNED',
        resolutionNote: 'Test',
      },
    });
    const res = createResponse();

    await adminProcessReport(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(401);
    expect(mockedService.adminProcessReport).not.toHaveBeenCalled();
  });

  it('returns 400 when report already processed', async () => {
    const body = {
      status: 'RESOLVED',
      actionTaken: 'USER_WARNED',
      resolutionNote: 'Cảnh cáo lần 1',
    };
    const req = createAuthRequest({
      user: { id: ADMIN_ID, role: 'ADMIN' },
      params: { id: VALID_REPORT_ID },
      body,
    });
    const res = createResponse();

    mockedService.adminProcessReport.mockRejectedValue(
      new reportService.ReportServiceError(
        'Báo cáo này đã được xử lý trước đó, không thể xử lý lại',
        400
      )
    );

    await adminProcessReport(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(400);
  });

  it('returns 404 when report not found', async () => {
    const body = {
      status: 'RESOLVED',
      actionTaken: 'POST_HIDDEN',
      resolutionNote: 'Ẩn bài',
    };
    const req = createAuthRequest({
      user: { id: ADMIN_ID, role: 'ADMIN' },
      params: { id: VALID_REPORT_ID },
      body,
    });
    const res = createResponse();

    mockedService.adminProcessReport.mockRejectedValue(
      new reportService.ReportServiceError('Không tìm thấy báo cáo', 404)
    );

    await adminProcessReport(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(404);
  });

  it('returns 400 when REFUNDED applied to non-TRANSACTION target', async () => {
    const body = {
      status: 'RESOLVED',
      actionTaken: 'REFUNDED',
      resolutionNote: 'Hoàn tiền cho người dùng',
    };
    const req = createAuthRequest({
      user: { id: ADMIN_ID, role: 'ADMIN' },
      params: { id: VALID_REPORT_ID },
      body,
    });
    const res = createResponse();

    mockedService.adminProcessReport.mockRejectedValue(
      new reportService.ReportServiceError(
        'Hoàn tiền chỉ áp dụng cho báo cáo loại TRANSACTION',
        400
      )
    );

    await adminProcessReport(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(400);
  });

  it('returns 500 on unexpected error without leaking details', async () => {
    const body = {
      status: 'RESOLVED',
      actionTaken: 'USER_BANNED',
      resolutionNote: 'Ban user',
    };
    const req = createAuthRequest({
      user: { id: ADMIN_ID, role: 'ADMIN' },
      params: { id: VALID_REPORT_ID },
      body,
    });
    const res = createResponse();

    mockedService.adminProcessReport.mockRejectedValue(
      new Error('MongoDB timeout')
    );

    await adminProcessReport(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(500);
    const jsonCall = (res.json as unknown as jest.Mock).mock.calls[0][0];
    expect(jsonCall.error).toBeUndefined();
    expect(jsonCall.message).toBe('Đã xảy ra lỗi từ phía server');
  });
});

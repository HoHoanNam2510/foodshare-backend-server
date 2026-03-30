import { Request, Response } from 'express';

import {
  storeCreateVoucher,
  storeUpdateVoucher,
  storeToggleVoucher,
  getVoucherMarket,
  redeemVoucher,
  getMyVouchers,
  adminGetVouchers,
  adminToggleVoucher,
} from '@/controllers/voucherController';
import * as voucherService from '@/services/voucherService';

jest.mock('@/services/voucherService', () => ({
  __esModule: true,
  VoucherServiceError: class VoucherServiceError extends Error {
    public statusCode: number;
    constructor(message: string, statusCode: number) {
      super(message);
      this.statusCode = statusCode;
    }
  },
  storeCreateVoucher: jest.fn(),
  storeUpdateVoucher: jest.fn(),
  storeToggleVoucher: jest.fn(),
  getVoucherMarket: jest.fn(),
  redeemVoucher: jest.fn(),
  getMyVouchers: jest.fn(),
  adminToggleVoucher: jest.fn(),
  adminGetVouchers: jest.fn(),
}));

// =============================================
// Helpers
// =============================================

const mockedService = voucherService as unknown as {
  storeCreateVoucher: jest.Mock;
  storeUpdateVoucher: jest.Mock;
  storeToggleVoucher: jest.Mock;
  getVoucherMarket: jest.Mock;
  redeemVoucher: jest.Mock;
  getMyVouchers: jest.Mock;
  adminToggleVoucher: jest.Mock;
  adminGetVouchers: jest.Mock;
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
    user: { id: STORE_USER_ID, role: 'STORE' },
    body: {},
    params: {},
    query: {},
    headers: {},
    ...overrides,
  } as unknown as Request;
}

const STORE_USER_ID = '507f191e810c19729de860ea';
const NORMAL_USER_ID = '607f191e810c19729de860eb';
const ADMIN_ID = '807f191e810c19729de860ed';
const VOUCHER_ID = '707f191e810c19729de860ec';

// =============================================
// storeCreateVoucher
// =============================================
describe('storeCreateVoucher', () => {
  const validBody = {
    code: 'SUMMER2026',
    title: 'Giảm giá mùa hè',
    description: 'Giảm 20% cho đơn hàng trên 50k',
    discountType: 'PERCENTAGE',
    discountValue: 20,
    pointCost: 100,
    totalQuantity: 50,
    validFrom: '2026-04-01T00:00:00.000Z',
    validUntil: '2026-06-30T23:59:59.000Z',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates voucher successfully and returns 201', async () => {
    const req = createAuthRequest({ body: validBody });
    const res = createResponse();

    const mockVoucher = {
      _id: VOUCHER_ID,
      ...validBody,
      remainingQuantity: 50,
      isActive: true,
    };
    mockedService.storeCreateVoucher.mockResolvedValue(mockVoucher);

    await storeCreateVoucher(req, res);

    expect(mockedService.storeCreateVoucher).toHaveBeenCalledWith(
      STORE_USER_ID,
      validBody
    );
    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(201);
    expect(res.json as unknown as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: mockVoucher,
      })
    );
  });

  it('returns 401 when user is not authenticated', async () => {
    const req = createAuthRequest({ user: undefined, body: validBody });
    const res = createResponse();

    await storeCreateVoucher(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(401);
    expect(mockedService.storeCreateVoucher).not.toHaveBeenCalled();
  });

  it('returns 409 when voucher code already exists', async () => {
    const req = createAuthRequest({ body: validBody });
    const res = createResponse();

    mockedService.storeCreateVoucher.mockRejectedValue(
      new voucherService.VoucherServiceError(
        'Mã voucher "SUMMER2026" đã tồn tại trên hệ thống',
        409
      )
    );

    await storeCreateVoucher(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(409);
  });

  it('returns 400 when validUntil <= validFrom', async () => {
    const req = createAuthRequest({ body: validBody });
    const res = createResponse();

    mockedService.storeCreateVoucher.mockRejectedValue(
      new voucherService.VoucherServiceError(
        'Ngày hết hạn (validUntil) phải lớn hơn ngày bắt đầu (validFrom)',
        400
      )
    );

    await storeCreateVoucher(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(400);
  });

  it('returns 500 on unexpected error without leaking details', async () => {
    const req = createAuthRequest({ body: validBody });
    const res = createResponse();

    mockedService.storeCreateVoucher.mockRejectedValue(
      new Error('DB connection lost')
    );

    await storeCreateVoucher(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(500);
    const jsonCall = (res.json as unknown as jest.Mock).mock.calls[0][0];
    expect(jsonCall.success).toBe(false);
    expect(jsonCall.message).toBe('Đã xảy ra lỗi từ phía server');
  });
});

// =============================================
// storeUpdateVoucher
// =============================================
describe('storeUpdateVoucher', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('updates voucher successfully and returns 200', async () => {
    const body = { title: 'Tiêu đề mới', description: 'Mô tả mới' };
    const req = createAuthRequest({
      params: { id: VOUCHER_ID },
      body,
    });
    const res = createResponse();

    const mockVoucher = { _id: VOUCHER_ID, ...body };
    mockedService.storeUpdateVoucher.mockResolvedValue(mockVoucher);

    await storeUpdateVoucher(req, res);

    expect(mockedService.storeUpdateVoucher).toHaveBeenCalledWith(
      VOUCHER_ID,
      STORE_USER_ID,
      body
    );
    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(200);
  });

  it('returns 401 when user is not authenticated', async () => {
    const req = createAuthRequest({
      user: undefined,
      params: { id: VOUCHER_ID },
    });
    const res = createResponse();

    await storeUpdateVoucher(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(401);
    expect(mockedService.storeUpdateVoucher).not.toHaveBeenCalled();
  });

  it('returns 404 when voucher not found or not owned', async () => {
    const req = createAuthRequest({
      params: { id: VOUCHER_ID },
      body: { title: 'x' },
    });
    const res = createResponse();

    mockedService.storeUpdateVoucher.mockRejectedValue(
      new voucherService.VoucherServiceError(
        'Không tìm thấy voucher hoặc bạn không có quyền sửa',
        404
      )
    );

    await storeUpdateVoucher(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(404);
  });

  it('returns 400 when trying to edit restricted fields after redeem', async () => {
    const req = createAuthRequest({
      params: { id: VOUCHER_ID },
      body: { discountValue: 50 },
    });
    const res = createResponse();

    mockedService.storeUpdateVoucher.mockRejectedValue(
      new voucherService.VoucherServiceError(
        'Không thể sửa trường "discountValue" vì đã có khách hàng đổi mã này.',
        400
      )
    );

    await storeUpdateVoucher(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(400);
  });
});

// =============================================
// storeToggleVoucher
// =============================================
describe('storeToggleVoucher', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('deactivates voucher and returns correct message', async () => {
    const req = createAuthRequest({ params: { id: VOUCHER_ID } });
    const res = createResponse();

    mockedService.storeToggleVoucher.mockResolvedValue({
      _id: VOUCHER_ID,
      isActive: false,
    });

    await storeToggleVoucher(req, res);

    expect(mockedService.storeToggleVoucher).toHaveBeenCalledWith(
      VOUCHER_ID,
      STORE_USER_ID
    );
    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(200);
    expect(res.json as unknown as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: 'Đã ngừng phát hành voucher',
      })
    );
  });

  it('activates voucher and returns correct message', async () => {
    const req = createAuthRequest({ params: { id: VOUCHER_ID } });
    const res = createResponse();

    mockedService.storeToggleVoucher.mockResolvedValue({
      _id: VOUCHER_ID,
      isActive: true,
    });

    await storeToggleVoucher(req, res);

    expect(res.json as unknown as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Đã mở lại voucher',
      })
    );
  });

  it('returns 401 when user is not authenticated', async () => {
    const req = createAuthRequest({
      user: undefined,
      params: { id: VOUCHER_ID },
    });
    const res = createResponse();

    await storeToggleVoucher(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(401);
    expect(mockedService.storeToggleVoucher).not.toHaveBeenCalled();
  });

  it('returns 404 when voucher not found', async () => {
    const req = createAuthRequest({ params: { id: VOUCHER_ID } });
    const res = createResponse();

    mockedService.storeToggleVoucher.mockRejectedValue(
      new voucherService.VoucherServiceError(
        'Không tìm thấy voucher hoặc bạn không có quyền',
        404
      )
    );

    await storeToggleVoucher(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(404);
  });
});

// =============================================
// getVoucherMarket
// =============================================
describe('getVoucherMarket', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns paginated voucher list with 200', async () => {
    const req = createAuthRequest({
      query: {
        sort: 'newest',
        discountType: 'PERCENTAGE',
        page: '1',
        limit: '10',
      },
    });
    const res = createResponse();

    const mockResult = {
      data: [{ _id: VOUCHER_ID, title: 'Test' }],
      pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
    };
    mockedService.getVoucherMarket.mockResolvedValue(mockResult);

    await getVoucherMarket(req, res);

    expect(mockedService.getVoucherMarket).toHaveBeenCalledWith({
      sort: 'newest',
      discountType: 'PERCENTAGE',
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

  it('handles empty query params with defaults', async () => {
    const req = createAuthRequest({ query: {} });
    const res = createResponse();

    mockedService.getVoucherMarket.mockResolvedValue({
      data: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });

    await getVoucherMarket(req, res);

    expect(mockedService.getVoucherMarket).toHaveBeenCalledWith({
      sort: undefined,
      discountType: undefined,
      page: undefined,
      limit: undefined,
    });
  });
});

// =============================================
// redeemVoucher
// =============================================
describe('redeemVoucher', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('redeems voucher successfully and returns 200', async () => {
    const req = createAuthRequest({
      user: { id: NORMAL_USER_ID, role: 'USER' },
      params: { id: VOUCHER_ID },
    });
    const res = createResponse();

    const mockUserVoucher = {
      _id: 'uv1',
      userId: NORMAL_USER_ID,
      voucherId: VOUCHER_ID,
      status: 'UNUSED',
    };
    mockedService.redeemVoucher.mockResolvedValue(mockUserVoucher);

    await redeemVoucher(req, res);

    expect(mockedService.redeemVoucher).toHaveBeenCalledWith(
      NORMAL_USER_ID,
      VOUCHER_ID
    );
    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(200);
    expect(res.json as unknown as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: mockUserVoucher,
      })
    );
  });

  it('returns 401 when user is not authenticated', async () => {
    const req = createAuthRequest({
      user: undefined,
      params: { id: VOUCHER_ID },
    });
    const res = createResponse();

    await redeemVoucher(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(401);
    expect(mockedService.redeemVoucher).not.toHaveBeenCalled();
  });

  it('returns 403 when store tries to redeem own voucher', async () => {
    const req = createAuthRequest({
      user: { id: STORE_USER_ID, role: 'STORE' },
      params: { id: VOUCHER_ID },
    });
    const res = createResponse();

    mockedService.redeemVoucher.mockRejectedValue(
      new voucherService.VoucherServiceError(
        'Bạn không thể đổi voucher do chính mình tạo ra',
        403
      )
    );

    await redeemVoucher(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(403);
  });

  it('returns 400 when user has insufficient points', async () => {
    const req = createAuthRequest({
      user: { id: NORMAL_USER_ID, role: 'USER' },
      params: { id: VOUCHER_ID },
    });
    const res = createResponse();

    mockedService.redeemVoucher.mockRejectedValue(
      new voucherService.VoucherServiceError(
        'Bạn không đủ điểm để đổi. Cần 100 điểm, hiện có 50 điểm.',
        400
      )
    );

    await redeemVoucher(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(400);
  });

  it('returns 400 when voucher is out of stock', async () => {
    const req = createAuthRequest({
      user: { id: NORMAL_USER_ID, role: 'USER' },
      params: { id: VOUCHER_ID },
    });
    const res = createResponse();

    mockedService.redeemVoucher.mockRejectedValue(
      new voucherService.VoucherServiceError('Voucher đã hết lượt đổi', 400)
    );

    await redeemVoucher(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(400);
  });

  it('returns 400 when voucher has expired', async () => {
    const req = createAuthRequest({
      user: { id: NORMAL_USER_ID, role: 'USER' },
      params: { id: VOUCHER_ID },
    });
    const res = createResponse();

    mockedService.redeemVoucher.mockRejectedValue(
      new voucherService.VoucherServiceError('Voucher đã hết hạn', 400)
    );

    await redeemVoucher(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(400);
  });

  it('returns 404 when voucher not found', async () => {
    const req = createAuthRequest({
      user: { id: NORMAL_USER_ID, role: 'USER' },
      params: { id: VOUCHER_ID },
    });
    const res = createResponse();

    mockedService.redeemVoucher.mockRejectedValue(
      new voucherService.VoucherServiceError('Không tìm thấy voucher', 404)
    );

    await redeemVoucher(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(404);
  });
});

// =============================================
// getMyVouchers
// =============================================
describe('getMyVouchers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns user vouchers successfully with 200', async () => {
    const req = createAuthRequest({
      user: { id: NORMAL_USER_ID, role: 'USER' },
      query: {},
    });
    const res = createResponse();

    const mockVouchers = [
      { _id: 'uv1', status: 'UNUSED' },
      { _id: 'uv2', status: 'USED' },
    ];
    mockedService.getMyVouchers.mockResolvedValue(mockVouchers);

    await getMyVouchers(req, res);

    expect(mockedService.getMyVouchers).toHaveBeenCalledWith(
      NORMAL_USER_ID,
      undefined
    );
    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(200);
    expect(res.json as unknown as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: mockVouchers })
    );
  });

  it('passes status filter from query', async () => {
    const req = createAuthRequest({
      user: { id: NORMAL_USER_ID, role: 'USER' },
      query: { status: 'UNUSED' },
    });
    const res = createResponse();

    mockedService.getMyVouchers.mockResolvedValue([]);

    await getMyVouchers(req, res);

    expect(mockedService.getMyVouchers).toHaveBeenCalledWith(
      NORMAL_USER_ID,
      'UNUSED'
    );
  });

  it('returns 401 when user is not authenticated', async () => {
    const req = createAuthRequest({ user: undefined });
    const res = createResponse();

    await getMyVouchers(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(401);
    expect(mockedService.getMyVouchers).not.toHaveBeenCalled();
  });
});

// =============================================
// adminGetVouchers
// =============================================
describe('adminGetVouchers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns paginated vouchers with 200', async () => {
    const req = createAuthRequest({
      user: { id: ADMIN_ID, role: 'ADMIN' },
      query: { isActive: 'true', page: '1', limit: '10' },
    });
    const res = createResponse();

    const mockResult = {
      data: [{ _id: VOUCHER_ID }],
      pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
    };
    mockedService.adminGetVouchers.mockResolvedValue(mockResult);

    await adminGetVouchers(req, res);

    expect(mockedService.adminGetVouchers).toHaveBeenCalledWith({
      isActive: true,
      creatorId: undefined,
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

  it('parses isActive=false correctly', async () => {
    const req = createAuthRequest({
      user: { id: ADMIN_ID, role: 'ADMIN' },
      query: { isActive: 'false' },
    });
    const res = createResponse();

    mockedService.adminGetVouchers.mockResolvedValue({
      data: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });

    await adminGetVouchers(req, res);

    expect(mockedService.adminGetVouchers).toHaveBeenCalledWith(
      expect.objectContaining({ isActive: false })
    );
  });

  it('handles empty query with undefined filters', async () => {
    const req = createAuthRequest({
      user: { id: ADMIN_ID, role: 'ADMIN' },
      query: {},
    });
    const res = createResponse();

    mockedService.adminGetVouchers.mockResolvedValue({
      data: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });

    await adminGetVouchers(req, res);

    expect(mockedService.adminGetVouchers).toHaveBeenCalledWith({
      isActive: undefined,
      creatorId: undefined,
      page: undefined,
      limit: undefined,
    });
  });
});

// =============================================
// adminToggleVoucher
// =============================================
describe('adminToggleVoucher', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('toggles voucher to inactive and returns 200', async () => {
    const req = createAuthRequest({
      user: { id: ADMIN_ID, role: 'ADMIN' },
      params: { id: VOUCHER_ID },
    });
    const res = createResponse();

    mockedService.adminToggleVoucher.mockResolvedValue({
      _id: VOUCHER_ID,
      isActive: false,
    });

    await adminToggleVoucher(req, res);

    expect(mockedService.adminToggleVoucher).toHaveBeenCalledWith(VOUCHER_ID);
    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(200);
    expect(res.json as unknown as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: 'Đã khóa voucher',
      })
    );
  });

  it('toggles voucher to active and returns correct message', async () => {
    const req = createAuthRequest({
      user: { id: ADMIN_ID, role: 'ADMIN' },
      params: { id: VOUCHER_ID },
    });
    const res = createResponse();

    mockedService.adminToggleVoucher.mockResolvedValue({
      _id: VOUCHER_ID,
      isActive: true,
    });

    await adminToggleVoucher(req, res);

    expect(res.json as unknown as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Đã mở lại voucher',
      })
    );
  });

  it('returns 404 when voucher not found', async () => {
    const req = createAuthRequest({
      user: { id: ADMIN_ID, role: 'ADMIN' },
      params: { id: VOUCHER_ID },
    });
    const res = createResponse();

    mockedService.adminToggleVoucher.mockRejectedValue(
      new voucherService.VoucherServiceError('Không tìm thấy voucher', 404)
    );

    await adminToggleVoucher(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(404);
  });

  it('returns 400 when voucher ID is invalid', async () => {
    const req = createAuthRequest({
      user: { id: ADMIN_ID, role: 'ADMIN' },
      params: { id: 'invalid-id' },
    });
    const res = createResponse();

    mockedService.adminToggleVoucher.mockRejectedValue(
      new voucherService.VoucherServiceError('Voucher ID không hợp lệ', 400)
    );

    await adminToggleVoucher(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(400);
  });

  it('returns 500 on unexpected error', async () => {
    const req = createAuthRequest({
      user: { id: ADMIN_ID, role: 'ADMIN' },
      params: { id: VOUCHER_ID },
    });
    const res = createResponse();

    mockedService.adminToggleVoucher.mockRejectedValue(
      new Error('Unexpected crash')
    );

    await adminToggleVoucher(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(500);
    const jsonCall = (res.json as unknown as jest.Mock).mock.calls[0][0];
    expect(jsonCall.success).toBe(false);
    expect(jsonCall.message).toBe('Đã xảy ra lỗi từ phía server');
  });
});

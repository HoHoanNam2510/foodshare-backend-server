import { Request, Response } from 'express';

import {
  createRequest,
  updateOrDeleteRequest,
  getPostTransactions,
  respondToRequest,
  createOrder,
  scanQrAndComplete,
  getMyTransactions,
  cancelOrderByStore,
  adminGetTransactions,
  adminForceUpdateStatus,
} from '@/controllers/transactionController';
import Transaction from '@/models/Transaction';
import Post from '@/models/Post';
import { awardTransactionPoints } from '@/services/greenPointService';

jest.mock('@/models/Transaction', () => ({
  __esModule: true,
  default: {
    create: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    findById: jest.fn(),
    countDocuments: jest.fn(),
  },
}));

jest.mock('@/models/Post', () => ({
  __esModule: true,
  default: {
    findById: jest.fn(),
    findOne: jest.fn(),
  },
}));

jest.mock('@/services/greenPointService', () => ({
  __esModule: true,
  awardTransactionPoints: jest.fn(),
}));

// =============================================
// Helpers
// =============================================

const mockedTransaction = Transaction as unknown as {
  create: jest.Mock;
  find: jest.Mock;
  findOne: jest.Mock;
  findById: jest.Mock;
  countDocuments: jest.Mock;
};

const mockedPost = Post as unknown as {
  findById: jest.Mock;
  findOne: jest.Mock;
};

const mockedAwardTransactionPoints =
  awardTransactionPoints as unknown as jest.Mock;

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

const OWNER_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const REQUESTER_ID = '507f191e810c19729de860ea';
const POST_ID = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const TXN_ID = 'cccccccccccccccccccccccc';

// =============================================
// TRX_F01: createRequest
// =============================================
describe('createRequest', () => {
  beforeEach(() => jest.clearAllMocks());

  it('creates a P2P request successfully', async () => {
    const req = createAuthRequest({ body: { postId: POST_ID, quantity: 2 } });
    const res = createResponse();

    mockedPost.findById.mockResolvedValue({
      _id: POST_ID,
      status: 'AVAILABLE',
      ownerId: { toString: () => OWNER_ID },
      remainingQuantity: 5,
    });
    mockedTransaction.create.mockResolvedValue({
      _id: TXN_ID,
      postId: POST_ID,
      type: 'REQUEST',
      status: 'PENDING',
    });

    await createRequest(req, res);

    expect(mockedTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'REQUEST',
        paymentMethod: 'FREE',
        status: 'PENDING',
      })
    );
    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(201);
  });

  it('returns 404 when post not found or not available', async () => {
    const req = createAuthRequest({ body: { postId: POST_ID, quantity: 1 } });
    const res = createResponse();

    mockedPost.findById.mockResolvedValue(null);

    await createRequest(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(404);
  });

  it('returns 400 when requesting own post', async () => {
    const req = createAuthRequest({ body: { postId: POST_ID, quantity: 1 } });
    const res = createResponse();

    mockedPost.findById.mockResolvedValue({
      _id: POST_ID,
      status: 'AVAILABLE',
      ownerId: { toString: () => REQUESTER_ID }, // Same as requester
      remainingQuantity: 5,
    });

    await createRequest(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(400);
  });

  it('returns 400 when quantity exceeds remaining', async () => {
    const req = createAuthRequest({ body: { postId: POST_ID, quantity: 10 } });
    const res = createResponse();

    mockedPost.findById.mockResolvedValue({
      _id: POST_ID,
      status: 'AVAILABLE',
      ownerId: { toString: () => OWNER_ID },
      remainingQuantity: 3,
    });

    await createRequest(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(400);
    expect(mockedTransaction.create).not.toHaveBeenCalled();
  });
});

// =============================================
// TRX_F02 & TRX_F03: updateOrDeleteRequest
// =============================================
describe('updateOrDeleteRequest', () => {
  beforeEach(() => jest.clearAllMocks());

  it('updates quantity successfully', async () => {
    const req = createAuthRequest({
      params: { id: TXN_ID },
      body: { action: 'UPDATE', quantity: 3 },
    });
    const res = createResponse();

    const save = jest.fn().mockResolvedValue(undefined);
    mockedTransaction.findOne.mockResolvedValue({
      _id: TXN_ID,
      quantity: 1,
      save,
    });

    await updateOrDeleteRequest(req, res);

    expect(save).toHaveBeenCalled();
    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(200);
  });

  it('deletes request successfully', async () => {
    const req = createAuthRequest({
      params: { id: TXN_ID },
      body: { action: 'DELETE' },
    });
    const res = createResponse();

    const deleteOne = jest.fn().mockResolvedValue(undefined);
    mockedTransaction.findOne.mockResolvedValue({
      _id: TXN_ID,
      deleteOne,
    });

    await updateOrDeleteRequest(req, res);

    expect(deleteOne).toHaveBeenCalled();
    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(200);
  });

  it('returns 404 when transaction not found or already processed', async () => {
    const req = createAuthRequest({
      params: { id: TXN_ID },
      body: { action: 'UPDATE', quantity: 2 },
    });
    const res = createResponse();

    mockedTransaction.findOne.mockResolvedValue(null);

    await updateOrDeleteRequest(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(404);
  });

  it('returns 400 for invalid action', async () => {
    const req = createAuthRequest({
      params: { id: TXN_ID },
      body: { action: 'INVALID' },
    });
    const res = createResponse();

    mockedTransaction.findOne.mockResolvedValue({ _id: TXN_ID });

    await updateOrDeleteRequest(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(400);
  });
});

// =============================================
// TRX_F04: getPostTransactions
// =============================================
describe('getPostTransactions', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns PENDING transactions for P2P post', async () => {
    const req = createAuthRequest({ params: { postId: POST_ID } });
    const res = createResponse();

    mockedPost.findOne.mockResolvedValue({
      _id: POST_ID,
      type: 'P2P_FREE',
    });

    const sortMock = jest.fn().mockResolvedValue([{ _id: TXN_ID }]);
    const populateMock = jest.fn().mockReturnValue({ sort: sortMock });
    mockedTransaction.find.mockReturnValue({ populate: populateMock });

    await getPostTransactions(req, res);

    expect(mockedTransaction.find).toHaveBeenCalledWith(
      expect.objectContaining({ postId: POST_ID, status: 'PENDING' })
    );
    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(200);
  });

  it('returns ESCROWED transactions for B2C post', async () => {
    const req = createAuthRequest({ params: { postId: POST_ID } });
    const res = createResponse();

    mockedPost.findOne.mockResolvedValue({
      _id: POST_ID,
      type: 'B2C_MYSTERY_BAG',
    });

    const sortMock = jest.fn().mockResolvedValue([]);
    const populateMock = jest.fn().mockReturnValue({ sort: sortMock });
    mockedTransaction.find.mockReturnValue({ populate: populateMock });

    await getPostTransactions(req, res);

    expect(mockedTransaction.find).toHaveBeenCalledWith(
      expect.objectContaining({ postId: POST_ID, status: 'ESCROWED' })
    );
    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(200);
  });

  it('returns 403 when user is not the post owner', async () => {
    const req = createAuthRequest({ params: { postId: POST_ID } });
    const res = createResponse();

    mockedPost.findOne.mockResolvedValue(null);

    await getPostTransactions(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(403);
  });
});

// =============================================
// TRX_F05, TRX_F06, TRX_F11: respondToRequest
// =============================================
describe('respondToRequest', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects a request successfully', async () => {
    const req = createAuthRequest({
      params: { id: TXN_ID },
      body: { response: 'REJECT' },
    });
    const res = createResponse();

    const save = jest.fn().mockResolvedValue(undefined);
    mockedTransaction.findOne.mockResolvedValue({
      _id: TXN_ID,
      status: 'PENDING',
      save,
    });

    await respondToRequest(req, res);

    expect(save).toHaveBeenCalled();
    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(200);
    expect(res.json as unknown as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Đã từ chối yêu cầu' })
    );
  });

  it('accepts a request, updates post, and generates QR code', async () => {
    const req = createAuthRequest({
      params: { id: TXN_ID },
      body: { response: 'ACCEPT' },
    });
    const res = createResponse();

    const txnSave = jest.fn().mockResolvedValue(undefined);
    const postSave = jest.fn().mockResolvedValue(undefined);

    mockedTransaction.findOne.mockResolvedValue({
      _id: TXN_ID,
      postId: POST_ID,
      requesterId: REQUESTER_ID,
      quantity: 2,
      status: 'PENDING',
      save: txnSave,
    });

    mockedPost.findById.mockResolvedValue({
      _id: POST_ID,
      remainingQuantity: 5,
      status: 'AVAILABLE',
      save: postSave,
    });

    await respondToRequest(req, res);

    expect(txnSave).toHaveBeenCalled();
    expect(postSave).toHaveBeenCalled();
    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(200);
    expect(res.json as unknown as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({ verificationCode: expect.any(String) }),
      })
    );
  });

  it('sets post status to OUT_OF_STOCK when remaining becomes 0', async () => {
    const req = createAuthRequest({
      params: { id: TXN_ID },
      body: { response: 'ACCEPT' },
    });
    const res = createResponse();

    const postDoc = {
      _id: POST_ID,
      remainingQuantity: 2,
      status: 'AVAILABLE',
      save: jest.fn().mockResolvedValue(undefined),
    };

    mockedTransaction.findOne.mockResolvedValue({
      _id: TXN_ID,
      postId: POST_ID,
      requesterId: REQUESTER_ID,
      quantity: 2,
      status: 'PENDING',
      save: jest.fn().mockResolvedValue(undefined),
    });
    mockedPost.findById.mockResolvedValue(postDoc);

    await respondToRequest(req, res);

    expect(postDoc.status).toBe('OUT_OF_STOCK');
    expect(postDoc.remainingQuantity).toBe(0);
  });

  it('returns 404 when transaction not found', async () => {
    const req = createAuthRequest({
      params: { id: TXN_ID },
      body: { response: 'ACCEPT' },
    });
    const res = createResponse();

    mockedTransaction.findOne.mockResolvedValue(null);

    await respondToRequest(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(404);
  });

  it('returns 400 when post has insufficient quantity on accept', async () => {
    const req = createAuthRequest({
      params: { id: TXN_ID },
      body: { response: 'ACCEPT' },
    });
    const res = createResponse();

    mockedTransaction.findOne.mockResolvedValue({
      _id: TXN_ID,
      postId: POST_ID,
      quantity: 10,
      status: 'PENDING',
      save: jest.fn(),
    });
    mockedPost.findById.mockResolvedValue({
      _id: POST_ID,
      remainingQuantity: 3,
    });

    await respondToRequest(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(400);
  });

  it('returns 400 for invalid response value', async () => {
    const req = createAuthRequest({
      params: { id: TXN_ID },
      body: { response: 'MAYBE' },
    });
    const res = createResponse();

    mockedTransaction.findOne.mockResolvedValue({
      _id: TXN_ID,
      status: 'PENDING',
      save: jest.fn(),
    });

    await respondToRequest(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(400);
  });
});

// =============================================
// TRX_F07: createOrder
// =============================================
describe('createOrder', () => {
  beforeEach(() => jest.clearAllMocks());

  it('creates a B2C order successfully', async () => {
    const req = createAuthRequest({
      body: { postId: POST_ID, quantity: 1, paymentMethod: 'MOMO' },
    });
    const res = createResponse();

    const postSave = jest.fn().mockResolvedValue(undefined);
    mockedPost.findById.mockResolvedValue({
      _id: POST_ID,
      status: 'AVAILABLE',
      type: 'B2C_MYSTERY_BAG',
      remainingQuantity: 5,
      ownerId: OWNER_ID,
      save: postSave,
    });
    mockedTransaction.create.mockResolvedValue({
      _id: TXN_ID,
      type: 'ORDER',
      status: 'PENDING',
    });

    await createOrder(req, res);

    expect(postSave).toHaveBeenCalled();
    expect(mockedTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'ORDER',
        paymentMethod: 'MOMO',
        expiredAt: expect.any(Date),
      })
    );
    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(201);
  });

  it('returns 404 when post is not B2C or not available', async () => {
    const req = createAuthRequest({
      body: { postId: POST_ID, quantity: 1, paymentMethod: 'MOMO' },
    });
    const res = createResponse();

    mockedPost.findById.mockResolvedValue({
      _id: POST_ID,
      status: 'AVAILABLE',
      type: 'P2P_FREE', // Wrong type
      remainingQuantity: 5,
    });

    await createOrder(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(404);
  });

  it('returns 400 when quantity exceeds remaining', async () => {
    const req = createAuthRequest({
      body: { postId: POST_ID, quantity: 10, paymentMethod: 'MOMO' },
    });
    const res = createResponse();

    mockedPost.findById.mockResolvedValue({
      _id: POST_ID,
      status: 'AVAILABLE',
      type: 'B2C_MYSTERY_BAG',
      remainingQuantity: 2,
    });

    await createOrder(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(400);
  });

  it('returns 400 when payment method is FREE for B2C', async () => {
    const req = createAuthRequest({
      body: { postId: POST_ID, quantity: 1, paymentMethod: 'FREE' },
    });
    const res = createResponse();

    mockedPost.findById.mockResolvedValue({
      _id: POST_ID,
      status: 'AVAILABLE',
      type: 'B2C_MYSTERY_BAG',
      remainingQuantity: 5,
    });

    await createOrder(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(400);
  });

  it('sets post to OUT_OF_STOCK when remaining becomes 0', async () => {
    const req = createAuthRequest({
      body: { postId: POST_ID, quantity: 3, paymentMethod: 'MOMO' },
    });
    const res = createResponse();

    const postDoc = {
      _id: POST_ID,
      status: 'AVAILABLE',
      type: 'B2C_MYSTERY_BAG',
      remainingQuantity: 3,
      ownerId: OWNER_ID,
      save: jest.fn().mockResolvedValue(undefined),
    };
    mockedPost.findById.mockResolvedValue(postDoc);
    mockedTransaction.create.mockResolvedValue({ _id: TXN_ID });

    await createOrder(req, res);

    expect(postDoc.status).toBe('OUT_OF_STOCK');
    expect(postDoc.remainingQuantity).toBe(0);
  });
});

// =============================================
// TRX_F12 & TRX_F13: scanQrAndComplete
// =============================================
describe('scanQrAndComplete', () => {
  beforeEach(() => jest.clearAllMocks());

  it('completes transaction after QR scan', async () => {
    const req = createAuthRequest({ body: { qrCode: 'valid-qr-code' } });
    const res = createResponse();

    const save = jest.fn().mockResolvedValue(undefined);
    mockedTransaction.findOne.mockResolvedValue({
      _id: TXN_ID,
      type: 'REQUEST',
      requesterId: { toString: () => REQUESTER_ID },
      ownerId: REQUESTER_ID,
      status: 'ESCROWED',
      save,
    });
    mockedAwardTransactionPoints.mockResolvedValue(undefined);

    await scanQrAndComplete(req, res);

    expect(save).toHaveBeenCalled();
    expect(mockedAwardTransactionPoints).toHaveBeenCalledWith(
      TXN_ID,
      'REQUEST',
      REQUESTER_ID,
      REQUESTER_ID
    );
    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(200);
  });

  it('returns 400 when qrCode is not provided', async () => {
    const req = createAuthRequest({ body: {} });
    const res = createResponse();

    await scanQrAndComplete(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(400);
  });

  it('returns 404 when QR does not match any transaction', async () => {
    const req = createAuthRequest({ body: { qrCode: 'invalid-qr' } });
    const res = createResponse();

    mockedTransaction.findOne.mockResolvedValue(null);

    await scanQrAndComplete(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(404);
  });
});

// =============================================
// getMyTransactions
// =============================================
describe('getMyTransactions', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns transaction history for current user', async () => {
    const req = createAuthRequest();
    const res = createResponse();

    const sortMock = jest.fn().mockResolvedValue([{ _id: TXN_ID }]);
    const populateMock = jest.fn().mockReturnValue({ sort: sortMock });
    mockedTransaction.find.mockReturnValue({ populate: populateMock });

    await getMyTransactions(req, res);

    expect(mockedTransaction.find).toHaveBeenCalledWith({
      requesterId: REQUESTER_ID,
    });
    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(200);
  });
});

// =============================================
// cancelOrderByStore
// =============================================
describe('cancelOrderByStore', () => {
  beforeEach(() => jest.clearAllMocks());

  it('cancels ESCROWED order and restores inventory', async () => {
    const req = createAuthRequest({ params: { id: TXN_ID } });
    const res = createResponse();

    const txnSave = jest.fn().mockResolvedValue(undefined);
    const postSave = jest.fn().mockResolvedValue(undefined);

    mockedTransaction.findOne.mockResolvedValue({
      _id: TXN_ID,
      postId: POST_ID,
      quantity: 2,
      status: 'ESCROWED',
      save: txnSave,
    });
    mockedPost.findById.mockResolvedValue({
      _id: POST_ID,
      remainingQuantity: 0,
      status: 'OUT_OF_STOCK',
      save: postSave,
    });

    await cancelOrderByStore(req, res);

    expect(txnSave).toHaveBeenCalled();
    expect(postSave).toHaveBeenCalled();
    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(200);
    expect(res.json as unknown as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Đã hủy đơn và hoàn tiền cho khách' })
    );
  });

  it('returns 404 when order not found or wrong status', async () => {
    const req = createAuthRequest({ params: { id: TXN_ID } });
    const res = createResponse();

    mockedTransaction.findOne.mockResolvedValue(null);

    await cancelOrderByStore(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(404);
  });
});

// =============================================
// ADM_T01: adminGetTransactions
// =============================================
describe('adminGetTransactions', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns paginated transactions for admin', async () => {
    const req = createAuthRequest({
      user: { id: 'admin-id', role: 'ADMIN' },
      query: { type: 'ORDER', status: 'ESCROWED', page: '1', limit: '10' },
    });
    const res = createResponse();

    const limitMock = jest.fn().mockResolvedValue([{ _id: TXN_ID }]);
    const skipMock = jest.fn().mockReturnValue({ limit: limitMock });
    const sortMock = jest.fn().mockReturnValue({ skip: skipMock });
    const populatePostMock = jest.fn().mockReturnValue({ sort: sortMock });
    const populateOwnerMock = jest
      .fn()
      .mockReturnValue({ populate: populatePostMock });
    const populateRequesterMock = jest
      .fn()
      .mockReturnValue({ populate: populateOwnerMock });
    mockedTransaction.find.mockReturnValue({ populate: populateRequesterMock });
    mockedTransaction.countDocuments.mockResolvedValue(1);

    await adminGetTransactions(req, res);

    expect(mockedTransaction.find).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ORDER', status: 'ESCROWED' })
    );
    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(200);
    expect(res.json as unknown as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        pagination: expect.objectContaining({
          page: 1,
          limit: 10,
          total: 1,
          totalPages: 1,
        }),
      })
    );
  });

  it('returns all transactions when no filters provided', async () => {
    const req = createAuthRequest({
      user: { id: 'admin-id', role: 'ADMIN' },
      query: {},
    });
    const res = createResponse();

    const limitMock = jest.fn().mockResolvedValue([]);
    const skipMock = jest.fn().mockReturnValue({ limit: limitMock });
    const sortMock = jest.fn().mockReturnValue({ skip: skipMock });
    const populatePostMock = jest.fn().mockReturnValue({ sort: sortMock });
    const populateOwnerMock = jest
      .fn()
      .mockReturnValue({ populate: populatePostMock });
    const populateRequesterMock = jest
      .fn()
      .mockReturnValue({ populate: populateOwnerMock });
    mockedTransaction.find.mockReturnValue({ populate: populateRequesterMock });
    mockedTransaction.countDocuments.mockResolvedValue(0);

    await adminGetTransactions(req, res);

    expect(mockedTransaction.find).toHaveBeenCalledWith({});
    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(200);
  });
});

// =============================================
// ADM_T02: adminForceUpdateStatus
// =============================================
describe('adminForceUpdateStatus', () => {
  beforeEach(() => jest.clearAllMocks());

  it('force-updates transaction status', async () => {
    const req = createAuthRequest({
      user: { id: 'admin-id', role: 'ADMIN' },
      params: { id: TXN_ID },
      body: { status: 'COMPLETED' },
    });
    const res = createResponse();

    const save = jest.fn().mockResolvedValue(undefined);
    mockedTransaction.findById.mockResolvedValue({
      _id: TXN_ID,
      status: 'ESCROWED',
      save,
    });

    await adminForceUpdateStatus(req, res);

    expect(save).toHaveBeenCalled();
    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(200);
    expect(res.json as unknown as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('COMPLETED'),
      })
    );
  });

  it('returns 400 for invalid status value', async () => {
    const req = createAuthRequest({
      user: { id: 'admin-id', role: 'ADMIN' },
      params: { id: TXN_ID },
      body: { status: 'INVALID_STATUS' },
    });
    const res = createResponse();

    await adminForceUpdateStatus(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(400);
    expect(mockedTransaction.findById).not.toHaveBeenCalled();
  });

  it('returns 404 when transaction not found', async () => {
    const req = createAuthRequest({
      user: { id: 'admin-id', role: 'ADMIN' },
      params: { id: TXN_ID },
      body: { status: 'CANCELLED' },
    });
    const res = createResponse();

    mockedTransaction.findById.mockResolvedValue(null);

    await adminForceUpdateStatus(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(404);
  });
});

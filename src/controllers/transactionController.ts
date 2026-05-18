import { Request, Response } from 'express';
import {
  TransactionServiceError,
  createP2PRequest,
  updateOrCancelRequest,
  getTransactionsForPost,
  respondToP2PRequest,
  createB2COrder,
  completePeerTransfer,
  confirmB2CReceipt,
  cancelB2COrder,
  getRequesterTransactions,
  getOwnerTransactions,
  getTransactionDetail,
  adminListTransactions,
  adminForceStatus,
  adminGetStatusLogs as getStatusLogsService,
  devForceComplete,
} from '@/services/transactionService';

const VALID_ADMIN_STATUSES = [
  'PENDING',
  'ACCEPTED',
  'REJECTED',
  'COMPLETED',
  'CANCELLED',
];

// --- TRX_F01: TẠO YÊU CẦU XIN ĐỒ (P2P) ---
export const createRequest = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const requesterId = req.user?.id as string;
    const { postId, quantity } = req.body;

    const transaction = await createP2PRequest({
      requesterId,
      postId,
      quantity,
    });

    res.status(201).json({
      success: true,
      message: 'Tạo yêu cầu xin đồ thành công',
      data: transaction,
    });
  } catch (error: unknown) {
    if (error instanceof TransactionServiceError) {
      res
        .status(error.statusCode)
        .json({ success: false, message: error.message });
      return;
    }
    const message =
      error instanceof Error ? error.message : 'Lỗi không xác định';
    res
      .status(500)
      .json({ success: false, message: 'Lỗi server', error: message });
  }
};

// --- TRX_F02 & TRX_F03: SỬA / XÓA YÊU CẦU XIN ĐỒ ---
export const updateOrDeleteRequest = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const transactionId = String(req.params.id);
    const requesterId = req.user?.id as string;
    const { action, quantity } = req.body;

    const result = await updateOrCancelRequest({
      transactionId,
      requesterId,
      action,
      quantity,
    });

    res.status(200).json({
      success: true,
      message: result.message,
      ...(result.data ? { data: result.data } : {}),
    });
  } catch (error: unknown) {
    if (error instanceof TransactionServiceError) {
      res
        .status(error.statusCode)
        .json({ success: false, message: error.message });
      return;
    }
    const message =
      error instanceof Error ? error.message : 'Lỗi không xác định';
    res
      .status(500)
      .json({ success: false, message: 'Lỗi server', error: message });
  }
};

// --- TRX_F04: XEM DANH SÁCH GIAO DỊCH CỦA 1 BÀI ĐĂNG ---
export const getPostTransactions = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const postId = String(req.params.postId);
    const ownerId = req.user?.id as string;

    const transactions = await getTransactionsForPost({ postId, ownerId });
    res.status(200).json({ success: true, data: transactions });
  } catch (error: unknown) {
    if (error instanceof TransactionServiceError) {
      res
        .status(error.statusCode)
        .json({ success: false, message: error.message });
      return;
    }
    const message =
      error instanceof Error ? error.message : 'Lỗi không xác định';
    res
      .status(500)
      .json({ success: false, message: 'Lỗi server', error: message });
  }
};

// --- TRX_F05, TRX_F06, TRX_F11: XÁC NHẬN/TỪ CHỐI YÊU CẦU ---
export const respondToRequest = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const transactionId = String(req.params.id);
    const ownerId = req.user?.id as string;
    const { response } = req.body;

    const result = await respondToP2PRequest({
      transactionId,
      ownerId,
      response,
    });

    res.status(200).json({
      success: true,
      message: result.message,
      ...(result.data ? { data: result.data } : {}),
    });
  } catch (error: unknown) {
    if (error instanceof TransactionServiceError) {
      res
        .status(error.statusCode)
        .json({ success: false, message: error.message });
      return;
    }
    const message =
      error instanceof Error ? error.message : 'Lỗi không xác định';
    res
      .status(500)
      .json({ success: false, message: 'Lỗi server', error: message });
  }
};

// --- TRX_F07: ĐẶT MUA TÚI MÙ (B2C) ---
export const createOrder = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const requesterId = req.user?.id as string;
    const { postId, quantity } = req.body;

    const order = await createB2COrder({ requesterId, postId, quantity });

    res.status(201).json({
      success: true,
      message: 'Đặt hàng thành công. Chờ cửa hàng xác nhận.',
      data: order,
    });
  } catch (error: unknown) {
    if (error instanceof TransactionServiceError) {
      res
        .status(error.statusCode)
        .json({ success: false, message: error.message });
      return;
    }
    const message =
      error instanceof Error ? error.message : 'Lỗi không xác định';
    res
      .status(500)
      .json({ success: false, message: 'Lỗi server', error: message });
  }
};

// --- TRX_F12 & TRX_F13: QUÉT MÃ QR & HOÀN TẤT (P2P) ---
export const scanQrAndComplete = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user?.id as string;
    const { qrCode } = req.body;

    const transaction = await completePeerTransfer({ userId, qrCode });

    res.status(200).json({
      success: true,
      message: 'Xác nhận giao nhận thành công!',
      data: transaction,
    });
  } catch (error: unknown) {
    if (error instanceof TransactionServiceError) {
      res
        .status(error.statusCode)
        .json({ success: false, message: error.message });
      return;
    }
    const message =
      error instanceof Error ? error.message : 'Lỗi không xác định';
    res
      .status(500)
      .json({ success: false, message: 'Lỗi server', error: message });
  }
};

// --- B2C: STORE XÁC NHẬN ĐÃ NHẬN TIỀN ---
export const confirmReceiptByStore = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const transactionId = String(req.params.id);
    const ownerId = req.user?.id as string;

    const transaction = await confirmB2CReceipt({ transactionId, ownerId });

    res.status(200).json({
      success: true,
      message: 'Đã xác nhận nhận tiền thành công',
      data: transaction,
    });
  } catch (error: unknown) {
    if (error instanceof TransactionServiceError) {
      res
        .status(error.statusCode)
        .json({ success: false, message: error.message });
      return;
    }
    const message =
      error instanceof Error ? error.message : 'Lỗi không xác định';
    res
      .status(500)
      .json({ success: false, message: 'Lỗi server', error: message });
  }
};

// --- XEM LỊCH SỬ GIAO DỊCH CỦA TÔI ---
export const getMyTransactions = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const requesterId = req.user?.id as string;
    const transactions = await getRequesterTransactions(requesterId);
    res.status(200).json({ success: true, data: transactions });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Lỗi không xác định';
    res
      .status(500)
      .json({ success: false, message: 'Lỗi server', error: message });
  }
};

// --- XEM GIAO DỊCH (TƯ CÁCH NGƯỜI CHO / STORE) ---
export const getMyTransactionsAsOwner = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const ownerId = req.user?.id as string;
    const transactions = await getOwnerTransactions(ownerId);
    res.status(200).json({ success: true, data: transactions });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Lỗi không xác định';
    res
      .status(500)
      .json({ success: false, message: 'Lỗi server', error: message });
  }
};

// --- HỦY ĐƠN TÚI MÙ BỞI STORE ---
export const cancelOrderByStore = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const transactionId = String(req.params.id);
    const ownerId = req.user?.id as string;

    await cancelB2COrder({ transactionId, ownerId });

    res.status(200).json({ success: true, message: 'Đã hủy đơn hàng' });
  } catch (error: unknown) {
    if (error instanceof TransactionServiceError) {
      res
        .status(error.statusCode)
        .json({ success: false, message: error.message });
      return;
    }
    const message =
      error instanceof Error ? error.message : 'Lỗi không xác định';
    res
      .status(500)
      .json({ success: false, message: 'Lỗi server', error: message });
  }
};

// --- TRX_F14: XEM CHI TIẾT GIAO DỊCH THEO ID ---
export const getTransactionById = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const transactionId = String(req.params.id);
    const userId = req.user?.id as string;

    const transaction = await getTransactionDetail({ transactionId, userId });

    if (!transaction) {
      res.status(404).json({
        success: false,
        message: 'Không tìm thấy giao dịch hoặc bạn không có quyền xem',
      });
      return;
    }

    res.status(200).json({ success: true, data: transaction });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Lỗi không xác định';
    res
      .status(500)
      .json({ success: false, message: 'Lỗi server', error: message });
  }
};

// --- ADM_T01: ADMIN XEM TOÀN BỘ GIAO DỊCH ---
export const adminGetTransactions = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { type, status, page = '1', limit = '20' } = req.query;

    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.min(
      100,
      Math.max(1, parseInt(limit as string, 10) || 20)
    );

    const result = await adminListTransactions({
      type: typeof type === 'string' && type ? type : undefined,
      status: typeof status === 'string' && status ? status : undefined,
      page: pageNum,
      limit: limitNum,
    });

    res.status(200).json({
      success: true,
      data: result.data,
      pagination: result.pagination,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Lỗi không xác định';
    res
      .status(500)
      .json({ success: false, message: 'Lỗi server', error: message });
  }
};

// --- ADM_T02: ADMIN ÉP ĐỔI TRẠNG THÁI GIAO DỊCH ---
export const adminForceUpdateStatus = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const transactionId = String(req.params.id);
    const adminId = req.user?.id as string;
    const { status } = req.body;

    if (!VALID_ADMIN_STATUSES.includes(status)) {
      res.status(400).json({
        success: false,
        message: `Trạng thái không hợp lệ. Giá trị cho phép: ${VALID_ADMIN_STATUSES.join(', ')}`,
      });
      return;
    }

    const transaction = await adminForceStatus({
      transactionId,
      status,
      adminId,
    });

    res.status(200).json({
      success: true,
      message: `Đã ép đổi trạng thái giao dịch thành ${status}`,
      data: transaction,
    });
  } catch (error: unknown) {
    if (error instanceof TransactionServiceError) {
      res
        .status(error.statusCode)
        .json({ success: false, message: error.message });
      return;
    }
    const message =
      error instanceof Error ? error.message : 'Lỗi không xác định';
    res
      .status(500)
      .json({ success: false, message: 'Lỗi server', error: message });
  }
};

// --- ADM_T03: ADMIN XEM LỊCH SỬ TRẠNG THÁI ---
export const adminGetStatusLogs = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { transactionId, page = '1', limit = '15' } = req.query;

    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.min(
      100,
      Math.max(1, parseInt(limit as string, 10) || 15)
    );

    const result = await getStatusLogsService({
      transactionId:
        typeof transactionId === 'string' && transactionId
          ? transactionId
          : undefined,
      page: pageNum,
      limit: limitNum,
    });

    res.status(200).json({
      success: true,
      data: result.data,
      pagination: result.pagination,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Lỗi không xác định';
    res
      .status(500)
      .json({ success: false, message: 'Lỗi server', error: message });
  }
};

// --- DEV ONLY: Hoàn tất giao dịch không cần quét QR ---
export const devCompleteTransaction = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    if (process.env.NODE_ENV !== 'development') {
      res.status(403).json({
        success: false,
        message: 'Endpoint này chỉ khả dụng trong môi trường development',
      });
      return;
    }

    const transactionId = String(req.params.id);
    const transaction = await devForceComplete(transactionId);

    res.status(200).json({
      success: true,
      message: '[DEV] Giao dịch đã hoàn tất thành công (bỏ qua quét QR)',
      data: transaction,
    });
  } catch (error: unknown) {
    if (error instanceof TransactionServiceError) {
      res
        .status(error.statusCode)
        .json({ success: false, message: error.message });
      return;
    }
    const message =
      error instanceof Error ? error.message : 'Lỗi không xác định';
    res
      .status(500)
      .json({ success: false, message: 'Lỗi server', error: message });
  }
};

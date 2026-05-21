import crypto from 'crypto';
import mongoose from 'mongoose';

import Transaction, { ITransaction } from '@/models/Transaction';
import TransactionStatusLog from '@/models/TransactionStatusLog';
import Post from '@/models/Post';
import User from '@/models/User';
import { awardTransactionPoints } from '@/services/greenPointService';
import { checkAndAwardBadges } from '@/services/badgeService';
import { createNotification } from '@/services/notificationService';
import logger from '@/utils/logger';

export class TransactionServiceError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number
  ) {
    super(message);
    this.name = 'TransactionServiceError';
  }
}

// =============================================
// P2P REQUEST
// =============================================

export async function createP2PRequest(params: {
  requesterId: string;
  postId: string;
  quantity: number;
}): Promise<ITransaction> {
  const { requesterId, postId, quantity } = params;

  const post = await Post.findById(postId);
  if (!post || post.status !== 'AVAILABLE') {
    throw new TransactionServiceError(
      'Bài đăng không tồn tại hoặc đã hết hạn/hết hàng',
      404
    );
  }

  if (post.ownerId.toString() === requesterId) {
    throw new TransactionServiceError(
      'Bạn không thể tự xin đồ của chính mình',
      400
    );
  }

  const existingRequest = await Transaction.findOne({
    postId,
    requesterId,
    type: 'REQUEST',
    status: { $in: ['PENDING', 'ACCEPTED'] },
  });
  if (existingRequest) {
    throw new TransactionServiceError(
      'Bạn đã có yêu cầu đang chờ hoặc đã được chấp nhận cho bài đăng này. Vui lòng đợi kết quả hoặc hủy yêu cầu cũ trước khi gửi lại.',
      400
    );
  }

  if (quantity > post.remainingQuantity) {
    throw new TransactionServiceError(
      'Số lượng yêu cầu vượt quá số lượng hiện có',
      400
    );
  }

  return Transaction.create({
    postId,
    requesterId,
    ownerId: post.ownerId,
    type: 'REQUEST',
    quantity,
    status: 'PENDING',
    paymentMethod: 'FREE',
  });
}

export async function updateOrCancelRequest(params: {
  transactionId: string;
  requesterId: string;
  action: string;
  quantity?: number;
}): Promise<{ message: string; data?: ITransaction }> {
  const { transactionId, requesterId, action, quantity } = params;

  const transaction = await Transaction.findOne({
    _id: transactionId,
    requesterId,
    status: 'PENDING',
  });

  if (!transaction) {
    throw new TransactionServiceError(
      'Không tìm thấy yêu cầu hoặc yêu cầu đã được xử lý',
      404
    );
  }

  if (action === 'DELETE') {
    if (transaction.type === 'ORDER') {
      const post = await Post.findById(transaction.postId);
      if (post) {
        post.remainingQuantity += transaction.quantity;
        if (post.status === 'OUT_OF_STOCK') post.status = 'AVAILABLE';
        await post.save();
      }
      transaction.status = 'CANCELLED';
      await transaction.save();
      return { message: 'Đã hủy đơn hàng' };
    }
    await transaction.deleteOne();
    return { message: 'Đã hủy yêu cầu xin đồ' };
  }

  if (action === 'UPDATE' && quantity !== undefined) {
    transaction.quantity = quantity;
    await transaction.save();
    return { message: 'Cập nhật yêu cầu thành công', data: transaction };
  }

  throw new TransactionServiceError('Hành động không hợp lệ', 400);
}

export async function getTransactionsForPost(params: {
  postId: string;
  ownerId: string;
}): Promise<ITransaction[]> {
  const post = await Post.findOne({
    _id: params.postId,
    ownerId: params.ownerId,
  });
  if (!post) {
    throw new TransactionServiceError(
      'Bạn không có quyền xem danh sách này',
      403
    );
  }

  const statusFilter =
    post.type === 'P2P_FREE' ? { status: 'PENDING' } : { status: 'ACCEPTED' };

  return Transaction.find({ postId: params.postId, ...statusFilter })
    .populate('requesterId', 'fullName avatar averageRating')
    .sort({ createdAt: -1 });
}

export async function respondToP2PRequest(params: {
  transactionId: string;
  ownerId: string;
  response: string;
}): Promise<{ message: string; data?: unknown }> {
  const { transactionId, ownerId, response } = params;

  const transaction = await Transaction.findOne({
    _id: transactionId,
    ownerId,
    status: 'PENDING',
  });
  if (!transaction) {
    throw new TransactionServiceError(
      'Yêu cầu không tồn tại hoặc đã được xử lý',
      404
    );
  }

  if (response === 'REJECT') {
    if (transaction.type === 'ORDER') {
      const post = await Post.findById(transaction.postId);
      if (post) {
        post.remainingQuantity += transaction.quantity;
        if (post.status === 'OUT_OF_STOCK' && post.remainingQuantity > 0)
          post.status = 'AVAILABLE';
        await post.save();
      }
    }
    transaction.status = 'REJECTED';
    await transaction.save();
    await createNotification(
      transaction.requesterId.toString(),
      'TRANSACTION',
      'Yêu cầu bị từ chối',
      'Yêu cầu xin đồ của bạn đã bị từ chối bởi người đăng.',
      transaction._id.toString()
    );
    return { message: 'Đã từ chối yêu cầu' };
  }

  if (response === 'ACCEPT') {
    const post = await Post.findById(transaction.postId);

    if (transaction.type === 'REQUEST') {
      if (!post || post.remainingQuantity < transaction.quantity) {
        throw new TransactionServiceError(
          'Số lượng đồ không đủ để duyệt yêu cầu này',
          400
        );
      }

      const rawQrString = `${transaction._id}-${transaction.requesterId}-${crypto.randomBytes(4).toString('hex')}`;
      transaction.verificationCode = rawQrString;
      transaction.status = 'ACCEPTED';
      await transaction.save();

      post.remainingQuantity -= transaction.quantity;
      if (post.remainingQuantity === 0) post.status = 'OUT_OF_STOCK';
      await post.save();

      await createNotification(
        transaction.requesterId.toString(),
        'TRANSACTION',
        'Yêu cầu được chấp nhận!',
        'Yêu cầu xin đồ của bạn đã được chấp nhận. Hãy đến nhận đồ và quét mã QR.',
        transaction._id.toString()
      );

      return {
        message: 'Đã chấp nhận yêu cầu xin đồ',
        data: { verificationCode: rawQrString },
      };
    }

    // B2C ORDER
    const store = await User.findById(ownerId);
    if (
      !store?.paymentInfo?.bankAccountNumber ||
      !store?.paymentInfo?.bankAccountName
    ) {
      throw new TransactionServiceError(
        'Cửa hàng chưa cài đặt thông tin thanh toán. Vui lòng cập nhật trước khi nhận đơn.',
        400
      );
    }

    const orderRef = (transaction._id as mongoose.Types.ObjectId)
      .toString()
      .slice(-8)
      .toUpperCase();
    transaction.verificationCode = `FS${orderRef}`;
    transaction.bankSnapshot = {
      bankName: store.paymentInfo.bankName,
      bankAccountNumber: store.paymentInfo.bankAccountNumber,
      bankAccountName: store.paymentInfo.bankAccountName,
    };
    transaction.status = 'ACCEPTED';
    await transaction.save();

    await createNotification(
      transaction.requesterId.toString(),
      'TRANSACTION',
      'Đơn hàng được chấp nhận!',
      'Cửa hàng đã chấp nhận đơn hàng. Hãy đến thanh toán trực tiếp qua chuyển khoản.',
      transaction._id.toString()
    );

    return { message: 'Đã chấp nhận đơn hàng', data: transaction };
  }

  throw new TransactionServiceError('Phản hồi không hợp lệ', 400);
}

// =============================================
// B2C ORDER
// =============================================

export async function createB2COrder(params: {
  requesterId: string;
  postId: string;
  quantity: number;
}): Promise<ITransaction> {
  const { requesterId, postId, quantity } = params;

  const post = await Post.findById(postId);
  if (!post || post.status !== 'AVAILABLE' || post.type !== 'B2C_MYSTERY_BAG') {
    throw new TransactionServiceError(
      'Túi mù không tồn tại hoặc đã hết hàng',
      404
    );
  }

  if (quantity > post.remainingQuantity) {
    throw new TransactionServiceError('Số lượng túi mù không đủ', 400);
  }

  post.remainingQuantity -= quantity;
  if (post.remainingQuantity === 0) post.status = 'OUT_OF_STOCK';
  await post.save();

  const totalAmount = post.price * quantity;

  return Transaction.create({
    postId,
    requesterId,
    ownerId: post.ownerId,
    type: 'ORDER',
    quantity,
    totalAmount,
    status: 'PENDING',
    paymentMethod: 'BANK_TRANSFER',
  });
}

// =============================================
// COMPLETION (P2P QR scan + B2C store confirm)
// =============================================

async function _completeTransaction(transaction: ITransaction): Promise<void> {
  const post = await Post.findById(transaction.postId);
  if (post && post.remainingQuantity === 0) {
    post.status = 'HIDDEN';
    await post.save();
  }

  await awardTransactionPoints(
    (transaction._id as mongoose.Types.ObjectId).toString(),
    transaction.type as 'REQUEST' | 'ORDER',
    transaction.requesterId.toString(),
    transaction.ownerId.toString()
  );

  await Promise.all([
    createNotification(
      transaction.requesterId.toString(),
      'TRANSACTION',
      'Giao dịch hoàn tất!',
      'Giao dịch của bạn đã hoàn tất thành công. Cảm ơn bạn đã sử dụng FoodShare!',
      transaction._id.toString()
    ),
    createNotification(
      transaction.ownerId.toString(),
      'TRANSACTION',
      'Giao dịch hoàn tất!',
      'Đồ của bạn đã được nhận thành công. Cảm ơn bạn đã chia sẻ!',
      transaction._id.toString()
    ),
  ]);

  checkAndAwardBadges(
    transaction.requesterId.toString(),
    'TRANSACTION_COMPLETED'
  ).catch((err) => {
    logger.warn('[TransactionService] badge check (requester) failed:', err);
  });
  checkAndAwardBadges(
    transaction.ownerId.toString(),
    'TRANSACTION_COMPLETED'
  ).catch((err) => {
    logger.warn('[TransactionService] badge check (owner) failed:', err);
  });
}

export async function completePeerTransfer(params: {
  userId: string;
  qrCode: string;
}): Promise<ITransaction> {
  const { userId, qrCode } = params;

  if (!qrCode) {
    throw new TransactionServiceError('Vui lòng cung cấp mã QR', 400);
  }

  const transaction = await Transaction.findOne({
    verificationCode: qrCode,
    requesterId: userId,
    type: 'REQUEST',
    status: 'ACCEPTED',
  });

  if (!transaction) {
    throw new TransactionServiceError(
      'Mã QR không hợp lệ hoặc đơn hàng không ở trạng thái chờ giao nhận',
      404
    );
  }

  transaction.status = 'COMPLETED';
  await transaction.save();

  await _completeTransaction(transaction);
  return transaction;
}

export async function confirmB2CReceipt(params: {
  transactionId: string;
  ownerId: string;
}): Promise<ITransaction> {
  const { transactionId, ownerId } = params;

  const transaction = await Transaction.findOne({
    _id: transactionId,
    ownerId,
    type: 'ORDER',
    status: 'ACCEPTED',
  });

  if (!transaction) {
    throw new TransactionServiceError(
      'Không tìm thấy đơn hàng hoặc đơn không ở trạng thái chờ xác nhận',
      404
    );
  }

  transaction.status = 'COMPLETED';
  await transaction.save();

  await _completeTransaction(transaction);
  return transaction;
}

export async function cancelB2COrder(params: {
  transactionId: string;
  ownerId: string;
}): Promise<void> {
  const { transactionId, ownerId } = params;

  const transaction = await Transaction.findOne({
    _id: transactionId,
    ownerId,
    type: 'ORDER',
    status: 'ACCEPTED',
  });

  if (!transaction) {
    throw new TransactionServiceError(
      'Không tìm thấy đơn hàng hoặc đơn không ở trạng thái có thể hủy',
      404
    );
  }

  transaction.status = 'CANCELLED';
  await transaction.save();

  const post = await Post.findById(transaction.postId);
  if (post) {
    post.remainingQuantity += transaction.quantity;
    if (post.status === 'OUT_OF_STOCK') post.status = 'AVAILABLE';
    await post.save();
  }

  await createNotification(
    transaction.requesterId.toString(),
    'TRANSACTION',
    'Đơn hàng bị hủy',
    'Cửa hàng đã hủy đơn hàng của bạn.',
    transaction._id.toString()
  );
}

// =============================================
// QUERY
// =============================================

export async function getRequesterTransactions(
  requesterId: string
): Promise<ITransaction[]> {
  return Transaction.find({ requesterId })
    .populate({
      path: 'postId',
      select: 'title images type price',
      match: { isDeleted: { $in: [true, false, null] } },
    })
    .sort({ createdAt: -1 });
}

export async function getOwnerTransactions(
  ownerId: string
): Promise<ITransaction[]> {
  return Transaction.find({ ownerId })
    .populate({
      path: 'postId',
      select: 'title images type price',
      match: { isDeleted: { $in: [true, false, null] } },
    })
    .populate('requesterId', 'fullName avatar averageRating')
    .sort({ createdAt: -1 });
}

export async function getTransactionDetail(params: {
  transactionId: string;
  userId: string;
}): Promise<ITransaction | null> {
  return Transaction.findOne({
    _id: params.transactionId,
    $or: [{ requesterId: params.userId }, { ownerId: params.userId }],
  })
    .populate({
      path: 'postId',
      select: 'title images type price',
      match: { isDeleted: { $in: [true, false, null] } },
    })
    .populate('requesterId', 'fullName avatar averageRating');
}

// =============================================
// ADMIN
// =============================================

export interface AdminTransactionListResult {
  data: ITransaction[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export async function adminListTransactions(params: {
  type?: string;
  status?: string;
  page: number;
  limit: number;
}): Promise<AdminTransactionListResult> {
  const { page, limit } = params;
  const skip = (page - 1) * limit;

  const filter: Record<string, string> = {};
  if (params.type) filter.type = params.type;
  if (params.status) filter.status = params.status;

  const [transactions, total] = await Promise.all([
    Transaction.find(filter)
      .populate('requesterId', 'fullName email avatar')
      .populate('ownerId', 'fullName email avatar')
      .populate('postId', 'title type price')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Transaction.countDocuments(filter),
  ]);

  return {
    data: transactions,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function adminForceStatus(params: {
  transactionId: string;
  status: string;
  adminId: string;
}): Promise<ITransaction> {
  const { transactionId, status, adminId } = params;

  const transaction = await Transaction.findById(transactionId);
  if (!transaction) {
    throw new TransactionServiceError('Không tìm thấy giao dịch', 404);
  }

  const previousStatus = transaction.status;
  transaction.status = status as ITransaction['status'];
  await transaction.save();

  await TransactionStatusLog.create({
    transactionId: transaction._id,
    previousStatus,
    newStatus: status,
    changedBy: adminId,
  });

  return transaction;
}

export interface StatusLogResult {
  data: unknown[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export async function adminGetStatusLogs(params: {
  transactionId?: string;
  page: number;
  limit: number;
}): Promise<StatusLogResult> {
  const { page, limit } = params;
  const skip = (page - 1) * limit;

  const filter: Record<string, unknown> = {};
  if (params.transactionId) filter.transactionId = params.transactionId;

  const [logs, total] = await Promise.all([
    TransactionStatusLog.find(filter)
      .populate('transactionId', '_id type status postId')
      .populate('changedBy', 'fullName email avatar')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    TransactionStatusLog.countDocuments(filter),
  ]);

  return {
    data: logs,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function devForceComplete(
  transactionId: string
): Promise<ITransaction> {
  const transaction = await Transaction.findById(transactionId);
  if (!transaction) {
    throw new TransactionServiceError('Không tìm thấy giao dịch', 404);
  }

  if (transaction.status !== 'ACCEPTED') {
    throw new TransactionServiceError(
      `Giao dịch đang ở trạng thái ${transaction.status}, không thể hoàn tất. Cần ACCEPTED.`,
      400
    );
  }

  transaction.status = 'COMPLETED';
  await transaction.save();

  const post = await Post.findById(transaction.postId);
  if (post && post.remainingQuantity === 0) {
    post.status = 'HIDDEN';
    await post.save();
  }

  await awardTransactionPoints(
    (transaction._id as mongoose.Types.ObjectId).toString(),
    transaction.type as 'REQUEST' | 'ORDER',
    transaction.requesterId.toString(),
    transaction.ownerId.toString()
  );

  logger.info('[DEV] Transaction completed without QR scan', { transactionId });

  checkAndAwardBadges(
    transaction.requesterId.toString(),
    'TRANSACTION_COMPLETED'
  ).catch((err) => {
    logger.warn('[TransactionService] badge check (requester) failed:', err);
  });
  checkAndAwardBadges(
    transaction.ownerId.toString(),
    'TRANSACTION_COMPLETED'
  ).catch((err) => {
    logger.warn('[TransactionService] badge check (owner) failed:', err);
  });

  return transaction;
}

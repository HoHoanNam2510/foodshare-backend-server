import crypto from 'crypto';

import { Request, Response } from 'express';
import mongoose from 'mongoose';

import Transaction from '@/models/Transaction';
import Post from '@/models/Post';
import User from '@/models/User';
import { awardTransactionPoints } from '@/services/greenPointService';
import { checkAndAwardBadges } from '@/services/badgeService';
import { createNotification } from '@/services/notificationService';
import { generateVietQR } from '@/services/payment';
import logger from '@/utils/logger';

// --- TRX_F01: TẠO YÊU CẦU XIN ĐỒ (P2P) ---
export const createRequest = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const requesterId = req.user?.id;
    const { postId, quantity } = req.body;

    const post = await Post.findById(postId);
    if (!post || post.status !== 'AVAILABLE') {
      res.status(404).json({
        success: false,
        message: 'Bài đăng không tồn tại hoặc đã hết hạn/hết hàng',
      });
      return;
    }

    if (post.ownerId.toString() === requesterId) {
      res.status(400).json({
        success: false,
        message: 'Bạn không thể tự xin đồ của chính mình',
      });
      return;
    }

    const existingRequest = await Transaction.findOne({
      postId,
      requesterId,
      type: 'REQUEST',
      status: { $in: ['PENDING', 'ACCEPTED'] },
    });
    if (existingRequest) {
      res.status(400).json({
        success: false,
        message:
          'Bạn đã có yêu cầu đang chờ hoặc đã được chấp nhận cho bài đăng này. Vui lòng đợi kết quả hoặc hủy yêu cầu cũ trước khi gửi lại.',
      });
      return;
    }

    if (quantity > post.remainingQuantity) {
      res.status(400).json({
        success: false,
        message: 'Số lượng yêu cầu vượt quá số lượng hiện có',
      });
      return;
    }

    const newTransaction = await Transaction.create({
      postId,
      requesterId,
      ownerId: post.ownerId,
      type: 'REQUEST',
      quantity,
      status: 'PENDING',
      paymentMethod: 'FREE',
    });

    res.status(201).json({
      success: true,
      message: 'Tạo yêu cầu xin đồ thành công',
      data: newTransaction,
    });
  } catch (error: unknown) {
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
    const transactionId = req.params.id;
    const requesterId = req.user?.id;
    const { action, quantity } = req.body;

    const transaction = await Transaction.findOne({
      _id: transactionId,
      requesterId,
      status: 'PENDING',
    });

    if (!transaction) {
      res.status(404).json({
        success: false,
        message: 'Không tìm thấy yêu cầu hoặc yêu cầu đã được xử lý',
      });
      return;
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
        res.status(200).json({ success: true, message: 'Đã hủy đơn hàng' });
      } else {
        await transaction.deleteOne();
        res.status(200).json({ success: true, message: 'Đã hủy yêu cầu xin đồ' });
      }
      return;
    }

    if (action === 'UPDATE' && quantity) {
      transaction.quantity = quantity;
      await transaction.save();
      res.status(200).json({
        success: true,
        message: 'Cập nhật yêu cầu thành công',
        data: transaction,
      });
      return;
    }

    res.status(400).json({ success: false, message: 'Hành động không hợp lệ' });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Lỗi không xác định';
    res
      .status(500)
      .json({ success: false, message: 'Lỗi server', error: message });
  }
};

// --- TRX_F04: XEM DANH SÁCH GIAO DỊCH CỦA 1 BÀI ĐĂNG (P2P/B2C) ---
export const getPostTransactions = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { postId } = req.params;
    const ownerId = req.user?.id;

    const post = await Post.findOne({ _id: postId, ownerId });
    if (!post) {
      res.status(403).json({
        success: false,
        message: 'Bạn không có quyền xem danh sách này',
      });
      return;
    }

    // P2P: PENDING chờ duyệt; B2C: ACCEPTED (đã nhận, chờ gặp mặt)
    const statusFilter =
      post.type === 'P2P_FREE' ? { status: 'PENDING' } : { status: 'ACCEPTED' };

    const transactions = await Transaction.find({ postId, ...statusFilter })
      .populate('requesterId', 'fullName avatar averageRating')
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, data: transactions });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Lỗi không xác định';
    res
      .status(500)
      .json({ success: false, message: 'Lỗi server', error: message });
  }
};

// --- TRX_F05, TRX_F06, TRX_F11: XÁC NHẬN/TỪ CHỐI YÊU CẦU (P2P & B2C) ---
export const respondToRequest = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const transactionId = req.params.id;
    const ownerId = req.user?.id;
    const { response } = req.body;

    const transaction = await Transaction.findOne({
      _id: transactionId,
      ownerId,
      status: 'PENDING',
    });
    if (!transaction) {
      res.status(404).json({
        success: false,
        message: 'Yêu cầu không tồn tại hoặc đã được xử lý',
      });
      return;
    }

    if (response === 'REJECT') {
      if (transaction.type === 'ORDER') {
        const post = await Post.findById(transaction.postId);
        if (post) {
          post.remainingQuantity += transaction.quantity;
          if (post.status === 'OUT_OF_STOCK' && post.remainingQuantity > 0) {
            post.status = 'AVAILABLE';
          }
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
      res.status(200).json({ success: true, message: 'Đã từ chối yêu cầu' });
      return;
    }

    if (response === 'ACCEPT') {
      const post = await Post.findById(transaction.postId);
      
      // For P2P (REQUEST), we check if there is enough quantity.
      // For B2C (ORDER), quantity was already reserved/deducted during createOrder.
      if (transaction.type === 'REQUEST') {
        if (!post || post.remainingQuantity < transaction.quantity) {
          res.status(400).json({
            success: false,
            message: 'Số lượng đồ không đủ để duyệt yêu cầu này',
          });
          return;
        }
      }

      transaction.status = 'ACCEPTED';

      if (transaction.type === 'REQUEST') {
        // P2P: sinh verificationCode để buyer quét khi nhận đồ
        const rawQrString = `${transaction._id}-${transaction.requesterId}-${crypto.randomBytes(4).toString('hex')}`;
        transaction.verificationCode = rawQrString;
        await transaction.save();

        if (post) {
          post.remainingQuantity -= transaction.quantity;
          if (post.remainingQuantity === 0) {
            post.status = 'OUT_OF_STOCK';
          }
          await post.save();
        }

        await createNotification(
          transaction.requesterId.toString(),
          'TRANSACTION',
          'Yêu cầu được chấp nhận!',
          'Yêu cầu xin đồ của bạn đã được chấp nhận. Hãy đến nhận đồ và quét mã QR.',
          transaction._id.toString()
        );

        res.status(200).json({
          success: true,
          message: 'Đã chấp nhận yêu cầu xin đồ',
          data: { verificationCode: rawQrString },
        });
      } else {
        // B2C ORDER: validate store paymentInfo, generate VietQR → paymentQR
        const store = await User.findById(ownerId);
        if (
          !store?.paymentInfo?.bankCode ||
          !store?.paymentInfo?.bankAccountNumber ||
          !store?.paymentInfo?.bankAccountName
        ) {
          res.status(400).json({
            success: false,
            message:
              'Cửa hàng chưa cài đặt thông tin thanh toán. Vui lòng cập nhật trước khi nhận đơn.',
          });
          return;
        }

        const orderRef = (transaction._id as mongoose.Types.ObjectId)
          .toString()
          .slice(-8)
          .toUpperCase();
        const description = `FS${orderRef}`;

        try {
          const qrResult = await generateVietQR({
            bankCode: store.paymentInfo.bankCode,
            bankAccountNumber: store.paymentInfo.bankAccountNumber,
            bankAccountName: store.paymentInfo.bankAccountName,
            amount: transaction.totalAmount ?? 0,
            description,
          });
          transaction.paymentQR = qrResult.qrDataURL;
        } catch (qrErr) {
          logger.warn('[respondToRequest] VietQR generation failed', {
            error: qrErr instanceof Error ? qrErr.message : String(qrErr),
          });
        }

        await transaction.save();

        await createNotification(
          transaction.requesterId.toString(),
          'TRANSACTION',
          'Đơn hàng được chấp nhận!',
          'Cửa hàng đã chấp nhận đơn hàng. Hãy đến thanh toán trực tiếp qua chuyển khoản.',
          transaction._id.toString()
        );

        res.status(200).json({
          success: true,
          message: 'Đã chấp nhận đơn hàng',
          data: transaction,
        });
      }
      return;
    }

    res.status(400).json({ success: false, message: 'Phản hồi không hợp lệ' });
  } catch (error: unknown) {
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
    const requesterId = req.user?.id;
    const { postId, quantity } = req.body;

    const post = await Post.findById(postId);
    if (
      !post ||
      post.status !== 'AVAILABLE' ||
      post.type !== 'B2C_MYSTERY_BAG'
    ) {
      res.status(404).json({
        success: false,
        message: 'Túi mù không tồn tại hoặc đã hết hàng',
      });
      return;
    }

    if (quantity > post.remainingQuantity) {
      res
        .status(400)
        .json({ success: false, message: 'Số lượng túi mù không đủ' });
      return;
    }

    post.remainingQuantity -= quantity;
    if (post.remainingQuantity === 0) post.status = 'OUT_OF_STOCK';
    await post.save();

    const totalAmount = post.price * quantity;

    const newOrder = await Transaction.create({
      postId,
      requesterId,
      ownerId: post.ownerId,
      type: 'ORDER',
      quantity,
      totalAmount,
      status: 'PENDING',
      paymentMethod: 'BANK_TRANSFER',
    });

    res.status(201).json({
      success: true,
      message: 'Đặt hàng thành công. Chờ cửa hàng xác nhận.',
      data: newOrder,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Lỗi không xác định';
    res
      .status(500)
      .json({ success: false, message: 'Lỗi server', error: message });
  }
};

// --- TRX_F12 & TRX_F13: QUÉT MÃ QR & HOÀN TẤT (CHỈ P2P) ---
export const scanQrAndComplete = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { qrCode } = req.body;

    if (!qrCode) {
      res
        .status(400)
        .json({ success: false, message: 'Vui lòng cung cấp mã QR' });
      return;
    }

    // Chỉ xử lý P2P REQUEST/ACCEPTED — ORDER dùng confirmReceiptByStore
    const transaction = await Transaction.findOne({
      verificationCode: qrCode,
      requesterId: userId,
      type: 'REQUEST',
      status: 'ACCEPTED',
    });

    if (!transaction) {
      res.status(404).json({
        success: false,
        message:
          'Mã QR không hợp lệ hoặc đơn hàng không ở trạng thái chờ giao nhận',
      });
      return;
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

    res.status(200).json({
      success: true,
      message: 'Xác nhận giao nhận thành công!',
      data: transaction,
    });

    try {
      await checkAndAwardBadges(transaction.requesterId.toString(), 'TRANSACTION_COMPLETED');
    } catch (err) {
      console.warn('[TransactionController] badge check (requester) failed:', err);
    }
    try {
      await checkAndAwardBadges(transaction.ownerId.toString(), 'TRANSACTION_COMPLETED');
    } catch (err) {
      console.warn('[TransactionController] badge check (owner) failed:', err);
    }
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Lỗi không xác định';
    res
      .status(500)
      .json({ success: false, message: 'Lỗi server', error: message });
  }
};

// --- B2C: STORE XÁC NHẬN ĐÃ NHẬN TIỀN → COMPLETED ---
export const confirmReceiptByStore = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const transactionId = req.params.id;
    const ownerId = req.user?.id;

    const transaction = await Transaction.findOne({
      _id: transactionId,
      ownerId,
      type: 'ORDER',
      status: 'ACCEPTED',
    });

    if (!transaction) {
      res.status(404).json({
        success: false,
        message: 'Không tìm thấy đơn hàng hoặc đơn không ở trạng thái chờ xác nhận',
      });
      return;
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
      'ORDER',
      transaction.requesterId.toString(),
      transaction.ownerId.toString()
    );

    await Promise.all([
      createNotification(
        transaction.requesterId.toString(),
        'TRANSACTION',
        'Giao dịch hoàn tất!',
        'Cửa hàng đã xác nhận nhận tiền. Cảm ơn bạn đã ủng hộ!',
        transaction._id.toString()
      ),
      createNotification(
        transaction.ownerId.toString(),
        'TRANSACTION',
        'Đã nhận tiền!',
        'Bạn đã xác nhận nhận tiền thành công. Cảm ơn!',
        transaction._id.toString()
      ),
    ]);

    res.status(200).json({
      success: true,
      message: 'Đã xác nhận nhận tiền thành công',
      data: transaction,
    });

    try {
      await checkAndAwardBadges(transaction.requesterId.toString(), 'TRANSACTION_COMPLETED');
    } catch (err) {
      console.warn('[TransactionController] badge check (requester) failed:', err);
    }
    try {
      await checkAndAwardBadges(transaction.ownerId.toString(), 'TRANSACTION_COMPLETED');
    } catch (err) {
      console.warn('[TransactionController] badge check (owner) failed:', err);
    }
  } catch (error: unknown) {
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
    const requesterId = req.user?.id;

    const transactions = await Transaction.find({ requesterId })
      .populate({ path: 'postId', select: 'title images type price', match: { isDeleted: { $in: [true, false, null] } } })
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, data: transactions });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Lỗi không xác định';
    res
      .status(500)
      .json({ success: false, message: 'Lỗi server', error: message });
  }
};

// --- XEM GIAO DỊCH CỦA TÔI (TƯ CÁCH NGƯỜI CHO / STORE) ---
export const getMyTransactionsAsOwner = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const ownerId = req.user?.id;

    const transactions = await Transaction.find({ ownerId })
      .populate({ path: 'postId', select: 'title images type price', match: { isDeleted: { $in: [true, false, null] } } })
      .populate('requesterId', 'fullName avatar averageRating')
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, data: transactions });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Lỗi không xác định';
    res
      .status(500)
      .json({ success: false, message: 'Lỗi server', error: message });
  }
};

// --- HỦY ĐƠN TÚI MÙ BỞI STORE (B2C ACCEPTED) ---
export const cancelOrderByStore = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const transactionId = req.params.id;
    const ownerId = req.user?.id;

    const transaction = await Transaction.findOne({
      _id: transactionId,
      ownerId,
      type: 'ORDER',
      status: 'ACCEPTED',
    });

    if (!transaction) {
      res.status(404).json({
        success: false,
        message: 'Không tìm thấy đơn hàng hoặc đơn không ở trạng thái có thể hủy',
      });
      return;
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

    res.status(200).json({
      success: true,
      message: 'Đã hủy đơn hàng',
    });
  } catch (error: unknown) {
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
    const transactionId = req.params.id;
    const userId = req.user?.id;

    const transaction = await Transaction.findOne({
      _id: transactionId,
      $or: [{ requesterId: userId }, { ownerId: userId }],
    })
      .populate({ path: 'postId', select: 'title images type price', match: { isDeleted: { $in: [true, false, null] } } })
      .populate('requesterId', 'fullName avatar averageRating');

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

    const filter: Record<string, string> = {};
    if (typeof type === 'string' && type) filter.type = type;
    if (typeof status === 'string' && status) filter.status = status;

    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.min(
      100,
      Math.max(1, parseInt(limit as string, 10) || 20)
    );
    const skip = (pageNum - 1) * limitNum;

    const [transactions, total] = await Promise.all([
      Transaction.find(filter)
        .populate('requesterId', 'fullName email avatar')
        .populate('ownerId', 'fullName email avatar')
        .populate('postId', 'title type price')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      Transaction.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      data: transactions,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
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
    const transactionId = req.params.id;
    const { status } = req.body;

    const validStatuses = ['PENDING', 'ACCEPTED', 'REJECTED', 'COMPLETED', 'CANCELLED'];

    if (!validStatuses.includes(status)) {
      res.status(400).json({
        success: false,
        message: `Trạng thái không hợp lệ. Giá trị cho phép: ${validStatuses.join(', ')}`,
      });
      return;
    }

    const transaction = await Transaction.findById(transactionId);
    if (!transaction) {
      res.status(404).json({
        success: false,
        message: 'Không tìm thấy giao dịch',
      });
      return;
    }

    transaction.status = status;
    await transaction.save();

    res.status(200).json({
      success: true,
      message: `Đã ép đổi trạng thái giao dịch thành ${status}`,
      data: transaction,
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

    const transactionId = req.params.id;

    const transaction = await Transaction.findById(transactionId);
    if (!transaction) {
      res.status(404).json({ success: false, message: 'Không tìm thấy giao dịch' });
      return;
    }

    if (transaction.status !== 'ACCEPTED') {
      res.status(400).json({
        success: false,
        message: `Giao dịch đang ở trạng thái ${transaction.status}, không thể hoàn tất. Cần ACCEPTED.`,
      });
      return;
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

    res.status(200).json({
      success: true,
      message: '[DEV] Giao dịch đã hoàn tất thành công (bỏ qua quét QR)',
      data: transaction,
    });

    try {
      await checkAndAwardBadges(transaction.requesterId.toString(), 'TRANSACTION_COMPLETED');
    } catch (err) {
      console.warn('[TransactionController] badge check (requester) failed:', err);
    }
    try {
      await checkAndAwardBadges(transaction.ownerId.toString(), 'TRANSACTION_COMPLETED');
    } catch (err) {
      console.warn('[TransactionController] badge check (owner) failed:', err);
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Lỗi không xác định';
    res.status(500).json({ success: false, message: 'Lỗi server', error: message });
  }
};

import crypto from 'crypto';

import { Request, Response } from 'express';
import mongoose from 'mongoose';

import Transaction from '@/models/Transaction';
import Post from '@/models/Post';
import EscrowLedger from '@/models/EscrowLedger';
import { awardTransactionPoints } from '@/services/greenPointService';
import { checkAndAwardBadges } from '@/services/badgeService';
import { generateVietQR } from '@/services/payment';
import SystemConfig from '@/models/SystemConfig';
import logger from '@/utils/logger';

// --- TRX_F01: TẠO YÊU CẦU XIN ĐỒ (P2P) ---
export const createRequest = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const requesterId = req.user?.id;
    const { postId, quantity } = req.body;

    // 1. Kiểm tra bài đăng tồn tại và hợp lệ
    const post = await Post.findById(postId);
    if (!post || post.status !== 'AVAILABLE') {
      res.status(404).json({
        success: false,
        message: 'Bài đăng không tồn tại hoặc đã hết hạn/hết hàng',
      });
      return;
    }

    // 2. Không cho phép tự xin đồ của chính mình
    if (post.ownerId.toString() === requesterId) {
      res.status(400).json({
        success: false,
        message: 'Bạn không thể tự xin đồ của chính mình',
      });
      return;
    }

    // 3. Kiểm tra yêu cầu trùng lặp — mỗi người chỉ được có 1 yêu cầu active/accepted cho mỗi bài đăng
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

    // 4. Kiểm tra số lượng
    if (quantity > post.remainingQuantity) {
      res.status(400).json({
        success: false,
        message: 'Số lượng yêu cầu vượt quá số lượng hiện có',
      });
      return;
    }

    // 5. Tạo Transaction
    const newTransaction = await Transaction.create({
      postId,
      requesterId,
      ownerId: post.ownerId,
      type: 'REQUEST',
      quantity,
      status: 'PENDING',
      paymentMethod: 'FREE', // Ràng buộc bắt buộc cho P2P
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
    const { action, quantity } = req.body; // action: 'UPDATE' | 'DELETE'

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
        // B2C PENDING: tồn kho đã bị trừ lúc đặt → cần hoàn lại trước khi hủy
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
        await transaction.deleteOne(); // TRX_F03 — P2P: xóa hẳn
        res.status(200).json({ success: true, message: 'Đã hủy yêu cầu xin đồ' });
      }
      return;
    }

    if (action === 'UPDATE' && quantity) {
      transaction.quantity = quantity; // TRX_F02
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

    // Đảm bảo chỉ người đăng mới xem được danh sách này
    const post = await Post.findOne({ _id: postId, ownerId });
    if (!post) {
      res.status(403).json({
        success: false,
        message: 'Bạn không có quyền xem danh sách này',
      });
      return;
    }

    // P2P: Lọc các đơn đang PENDING chờ duyệt
    // B2C: Lọc các đơn đã ESCROWED (thanh toán xong, chờ giao)
    const statusFilter =
      post.type === 'P2P_FREE' ? { status: 'PENDING' } : { status: 'ESCROWED' };

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

// --- TRX_F05, TRX_F06, TRX_F11: XÁC NHẬN/TỪ CHỐI CHO ĐỒ & CẬP NHẬT POST & SINH QR (CHỈ P2P) ---
export const respondToRequest = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const transactionId = req.params.id;
    const ownerId = req.user?.id;
    const { response } = req.body; // 'ACCEPT' hoặc 'REJECT'

    const transaction = await Transaction.findOne({
      _id: transactionId,
      ownerId,
      type: 'REQUEST',
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
      transaction.status = 'REJECTED'; // TRX_F05
      await transaction.save();
      res.status(200).json({ success: true, message: 'Đã từ chối yêu cầu' });
      return;
    }

    if (response === 'ACCEPT') {
      const post = await Post.findById(transaction.postId);
      if (!post || post.remainingQuantity < transaction.quantity) {
        res.status(400).json({
          success: false,
          message: 'Số lượng đồ không đủ để duyệt yêu cầu này',
        });
        return;
      }

      // Cập nhật trạng thái Transaction sang ACCEPTED
      transaction.status = 'ACCEPTED';

      // Sinh mã xác minh QR cho P2P (TRX_F11) — người xin mang ra nhận đồ và quét
      const rawQrString = `${transaction._id}-${transaction.requesterId}-${crypto.randomBytes(4).toString('hex')}`;
      transaction.verificationCode = rawQrString;

      await transaction.save();

      // Cập nhật Post (TRX_F06): luôn set BOOKED khi duyệt; HIDDEN xử lý khi hoàn tất
      post.remainingQuantity -= transaction.quantity;
      post.status = 'BOOKED';
      await post.save();

      res.status(200).json({
        success: true,
        message: 'Đã chấp nhận yêu cầu xin đồ',
        data: { verificationCode: rawQrString },
      });
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

    // Tạm trừ tồn kho ngay lúc đặt (TRX_F07)
    post.remainingQuantity -= quantity;
    if (post.remainingQuantity === 0) post.status = 'OUT_OF_STOCK';
    await post.save();

    // Tạo đơn hàng, set hạn thanh toán 30 phút
    const expiredAt = new Date(Date.now() + 30 * 60 * 1000);
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
      expiredAt,
    });

    // Sinh thông tin QR chuyển khoản VietQR
    const orderRef = (newOrder._id as mongoose.Types.ObjectId).toString().slice(-8).toUpperCase();
    const description = `FS${orderRef}`;
    let paymentQR: {
      qrDataURL: string;
      bankName: string;
      bankAccountNumber: string;
      bankAccountName: string;
    } | null = null;

    try {
      paymentQR = await generateVietQR({ amount: totalAmount, description });
    } catch (qrErr) {
      // QR generation failed — client can still use bank info from separate endpoint
      logger.warn('[createOrder] VietQR generation failed', {
        error: qrErr instanceof Error ? qrErr.message : String(qrErr),
        stack: qrErr instanceof Error ? qrErr.stack : undefined,
      });
    }

    res.status(201).json({
      success: true,
      message: 'Đặt hàng thành công. Vui lòng chuyển khoản trong 30 phút.',
      data: {
        ...newOrder.toObject(),
        paymentInfo: paymentQR
          ? {
              qrDataURL: paymentQR.qrDataURL,
              bankName: paymentQR.bankName,
              bankAccountNumber: paymentQR.bankAccountNumber,
              bankAccountName: paymentQR.bankAccountName,
              amount: totalAmount,
              description,
            }
          : null,
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

// --- TRX_F08 & TRX_F11: ADMIN XÁC NHẬN ĐÃ NHẬN TIỀN CHUYỂN KHOẢN & SINH QR ---
export const adminConfirmPayment = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const transactionId = req.params.id;

    const transaction = await Transaction.findOne({
      _id: transactionId,
      type: 'ORDER',
      status: 'PENDING',
    });

    if (!transaction) {
      res.status(404).json({
        success: false,
        message: 'Không tìm thấy đơn hàng đang chờ xác nhận thanh toán',
      });
      return;
    }

    // Kiểm tra đơn hàng có hết hạn chưa
    if (transaction.expiredAt && new Date() > transaction.expiredAt) {
      transaction.status = 'CANCELLED';
      await transaction.save();

      const post = await Post.findById(transaction.postId);
      if (post) {
        post.remainingQuantity += transaction.quantity;
        if (post.status === 'OUT_OF_STOCK') post.status = 'AVAILABLE';
        await post.save();
      }

      res.status(400).json({
        success: false,
        message: 'Đơn hàng đã hết hạn và bị hủy tự động',
      });
      return;
    }

    // Sinh mã xác minh QR duy nhất cho đơn hàng
    const rawQrString = `${transaction._id}-${transaction.requesterId}-${crypto.randomBytes(4).toString('hex')}`;

    transaction.status = 'ESCROWED';
    transaction.verificationCode = rawQrString;
    transaction.pickupDeadline = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await transaction.save();

    // Tạo EscrowLedger entry
    const PLATFORM_FEE_PERCENT = 0;
    const amount = transaction.totalAmount ?? 0;
    const platformFee = Math.round((amount * PLATFORM_FEE_PERCENT) / 100);

    await EscrowLedger.create({
      transactionId: transaction._id,
      storeId: transaction.ownerId,
      buyerId: transaction.requesterId,
      amount,
      platformFee,
      netAmount: amount - platformFee,
      paymentMethod: 'BANK_TRANSFER',
      paymentTransId: rawQrString,
      status: 'HOLDING',
    });

    logger.info('[adminConfirmPayment] Payment confirmed, ESCROWED', {
      transactionId,
    });

    res.status(200).json({
      success: true,
      message: 'Đã xác nhận thanh toán. Đơn hàng chuyển sang trạng thái chờ giao.',
      data: { verificationCode: rawQrString },
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Lỗi không xác định';
    res
      .status(500)
      .json({ success: false, message: 'Lỗi server', error: message });
  }
};

// --- LẤY LẠI THÔNG TIN QR THANH TOÁN (dùng khi cần hiển thị lại) ---
export const getPaymentQR = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const transactionId = req.params.id;
    const requesterId = req.user?.id;

    const transaction = await Transaction.findOne({
      _id: transactionId,
      requesterId,
      type: 'ORDER',
      status: 'PENDING',
    });

    if (!transaction) {
      res.status(404).json({
        success: false,
        message: 'Không tìm thấy đơn hàng đang chờ thanh toán',
      });
      return;
    }

    if (transaction.expiredAt && new Date() > transaction.expiredAt) {
      res.status(400).json({
        success: false,
        message: 'Đơn hàng đã hết hạn thanh toán',
      });
      return;
    }

    const orderRef = (transaction._id as mongoose.Types.ObjectId).toString().slice(-8).toUpperCase();
    const description = `FS${orderRef}`;

    const paymentQR = await generateVietQR({
      amount: transaction.totalAmount ?? 0,
      description,
    });

    res.status(200).json({
      success: true,
      data: {
        ...paymentQR,
        description,
        expiredAt: transaction.expiredAt,
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

// --- TRX_F12 & TRX_F13: QUÉT MÃ QR & GIẢI NGÂN ---
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

    // P2P (REQUEST/ACCEPTED): Người nhận (requesterId) quét QR từ người cho
    // B2C (ORDER/ESCROWED): Chủ cửa hàng (ownerId) quét QR từ khách
    const transaction = await Transaction.findOne({
      verificationCode: qrCode,
      $or: [
        { requesterId: userId, type: 'REQUEST', status: 'ACCEPTED' },
        { ownerId: userId, type: 'ORDER', status: 'ESCROWED' },
      ],
    });

    if (!transaction) {
      res.status(404).json({
        success: false,
        message:
          'Mã QR không hợp lệ hoặc đơn hàng không ở trạng thái chờ giao nhận',
      });
      return;
    }

    // Hoàn tất giao dịch (TRX_F13)
    transaction.status = 'COMPLETED';
    await transaction.save();

    // Giải ngân escrow nếu là đơn B2C
    if (transaction.type === 'ORDER') {
      const escrow = await EscrowLedger.findOne({
        transactionId: transaction._id,
        status: 'HOLDING',
      });
      if (escrow) {
        escrow.status = 'DISBURSED';
        escrow.disbursedAt = new Date();
        await escrow.save();
      }
    }

    // Cập nhật Post: ẩn bài đăng nếu hết hàng (Giai đoạn 5 — P2P_TRANSACTION.md)
    const post = await Post.findById(transaction.postId);
    if (post && post.remainingQuantity === 0) {
      post.status = 'HIDDEN';
      await post.save();
    }

    // Cộng điểm GreenPoint cho cả 2 bên (Internal Hook)
    await awardTransactionPoints(
      (transaction._id as mongoose.Types.ObjectId).toString(),
      transaction.type as 'REQUEST' | 'ORDER',
      transaction.requesterId.toString(),
      transaction.ownerId.toString()
    );

    res.status(200).json({
      success: true,
      message:
        'Xác nhận giao nhận thành công! Tiền đã được giải ngân về ví của bạn.',
      data: transaction,
    });

    // Trigger TRANSACTION_COMPLETED badge check cho cả 2 bên
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
      .populate('postId', 'title images type price')
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
      .populate('postId', 'title images type price')
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

// --- HỦY ĐƠN TÚI MÙ BỞI STORE (B2C) ---
export const cancelOrderByStore = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const transactionId = req.params.id;
    const ownerId = req.user?.id;

    // Tìm đơn ORDER đang ESCROWED thuộc quyền sở hữu của Store
    const transaction = await Transaction.findOne({
      _id: transactionId,
      ownerId,
      type: 'ORDER',
      status: 'ESCROWED',
    });

    if (!transaction) {
      res.status(404).json({
        success: false,
        message: 'Không tìm thấy đơn hàng hoặc đơn không ở trạng thái chờ giao',
      });
      return;
    }

    // Hoàn tiền qua cổng thanh toán
    const escrow = await EscrowLedger.findOne({
      transactionId: transaction._id,
      status: 'HOLDING',
    });

    // Đánh dấu escrow cần hoàn tiền — admin xử lý chuyển khoản thủ công
    if (escrow) {
      escrow.status = 'REFUNDED';
      escrow.refundedAt = new Date();
      escrow.refundReason = 'Store hủy đơn hàng';
      await escrow.save();
    }

    // Hủy đơn → REFUNDED (vì đã hoàn tiền)
    transaction.status = 'REFUNDED';
    transaction.refundReason = 'Store hủy đơn hàng';
    transaction.refundedAt = new Date();
    await transaction.save();

    // Khôi phục tồn kho cho Post
    const post = await Post.findById(transaction.postId);
    if (post) {
      post.remainingQuantity += transaction.quantity;
      if (post.status === 'OUT_OF_STOCK') {
        post.status = 'AVAILABLE';
      }
      await post.save();
    }

    res.status(200).json({
      success: true,
      message: 'Đã hủy đơn và hoàn tiền cho khách',
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Lỗi không xác định';
    res
      .status(500)
      .json({ success: false, message: 'Lỗi server', error: message });
  }
};

// --- TRX_F14: XEM CHI TIẾT GIAO DỊCH THEO ID (RECEIVER HOẶC DONOR) ---
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
      .populate('postId', 'title images type price')
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

// --- ADM: ADMIN HOÀN TIỀN GIAO DỊCH ---
export const adminRefundTransaction = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const transactionId = req.params.id;
    const { reason } = req.body;

    const transaction = await Transaction.findById(transactionId);
    if (!transaction) {
      res.status(404).json({ success: false, message: 'Không tìm thấy giao dịch' });
      return;
    }

    if (!['ESCROWED', 'DISPUTED'].includes(transaction.status)) {
      res.status(400).json({
        success: false,
        message: 'Chỉ có thể hoàn tiền giao dịch đang ESCROWED hoặc DISPUTED',
      });
      return;
    }

    // Hoàn tiền qua cổng thanh toán
    const escrow = await EscrowLedger.findOne({
      transactionId: transaction._id,
      status: 'HOLDING',
    });

    // Đánh dấu escrow đã hoàn tiền — admin xử lý chuyển khoản thủ công
    if (escrow) {
      escrow.status = 'REFUNDED';
      escrow.refundedAt = new Date();
      escrow.refundReason = reason || 'Admin hoàn tiền';
      await escrow.save();
    }

    transaction.status = 'REFUNDED';
    transaction.refundReason = reason || 'Admin hoàn tiền';
    transaction.refundedAt = new Date();
    await transaction.save();

    // Khôi phục tồn kho
    const post = await Post.findById(transaction.postId);
    if (post) {
      post.remainingQuantity += transaction.quantity;
      if (post.status === 'OUT_OF_STOCK') post.status = 'AVAILABLE';
      await post.save();
    }

    res.status(200).json({
      success: true,
      message: 'Đã hoàn tiền giao dịch thành công',
      data: transaction,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Lỗi không xác định';
    res.status(500).json({ success: false, message: 'Lỗi server', error: message });
  }
};

// --- ADM: ADMIN GIẢI NGÂN ESCROW ---
export const adminDisburseEscrow = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const transactionId = req.params.id;

    const transaction = await Transaction.findById(transactionId);
    if (!transaction) {
      res.status(404).json({ success: false, message: 'Không tìm thấy giao dịch' });
      return;
    }

    if (!['ESCROWED', 'DISPUTED'].includes(transaction.status)) {
      res.status(400).json({
        success: false,
        message: 'Chỉ có thể giải ngân giao dịch đang ESCROWED hoặc DISPUTED',
      });
      return;
    }

    const escrow = await EscrowLedger.findOne({
      transactionId: transaction._id,
      status: 'HOLDING',
    });

    if (!escrow) {
      res.status(404).json({ success: false, message: 'Không tìm thấy escrow cho giao dịch này' });
      return;
    }

    escrow.status = 'DISBURSED';
    escrow.disbursedAt = new Date();
    await escrow.save();

    transaction.status = 'COMPLETED';
    await transaction.save();

    res.status(200).json({
      success: true,
      message: 'Đã giải ngân thành công',
      data: { transaction, escrow },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Lỗi không xác định';
    res.status(500).json({ success: false, message: 'Lỗi server', error: message });
  }
};

// --- ADM: ADMIN XEM DANH SÁCH ESCROW ---
export const adminGetEscrows = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { status, page = '1', limit = '20' } = req.query;

    const filter: Record<string, string> = {};
    if (typeof status === 'string' && status && status !== 'ALL') {
      filter.status = status;
    }

    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const [escrows, total] = await Promise.all([
      EscrowLedger.find(filter)
        .populate('storeId', 'fullName email avatar')
        .populate('buyerId', 'fullName email avatar')
        .populate('transactionId', 'status type paymentMethod')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      EscrowLedger.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      data: escrows,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Lỗi không xác định';
    res.status(500).json({ success: false, message: 'Lỗi server', error: message });
  }
};

// --- ADM: ADMIN XEM THỐNG KÊ ESCROW ---
export const adminGetEscrowStats = async (
  _req: Request,
  res: Response
): Promise<void> => {
  try {
    const [holding, disbursed, refunded] = await Promise.all([
      EscrowLedger.aggregate([
        { $match: { status: 'HOLDING' } },
        { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
      EscrowLedger.aggregate([
        { $match: { status: 'DISBURSED' } },
        { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
      EscrowLedger.aggregate([
        { $match: { status: 'REFUNDED' } },
        { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
    ]);

    res.status(200).json({
      success: true,
      data: {
        holding: { total: holding[0]?.total ?? 0, count: holding[0]?.count ?? 0 },
        disbursed: { total: disbursed[0]?.total ?? 0, count: disbursed[0]?.count ?? 0 },
        refunded: { total: refunded[0]?.total ?? 0, count: refunded[0]?.count ?? 0 },
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Lỗi không xác định';
    res.status(500).json({ success: false, message: 'Lỗi server', error: message });
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

    const validStatuses = [
      'PENDING',
      'ACCEPTED',
      'REJECTED',
      'ESCROWED',
      'COMPLETED',
      'CANCELLED',
      'REFUNDED',
      'DISPUTED',
    ];

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

// --- BUYER KHIẾU NẠI GIAO DỊCH ---
export const fileDispute = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const transactionId = req.params.id;
    const userId = req.user?.id;
    const { reason } = req.body;

    if (!reason || typeof reason !== 'string' || reason.trim().length < 10) {
      res.status(400).json({
        success: false,
        message: 'Vui lòng nhập lý do khiếu nại (ít nhất 10 ký tự)',
      });
      return;
    }

    const transaction = await Transaction.findOne({
      _id: transactionId,
      requesterId: userId,
      type: 'ORDER',
      status: 'ESCROWED',
    });

    if (!transaction) {
      res.status(404).json({
        success: false,
        message: 'Không tìm thấy đơn hàng hoặc đơn không ở trạng thái có thể khiếu nại',
      });
      return;
    }

    transaction.status = 'DISPUTED';
    transaction.disputeReason = reason.trim();
    await transaction.save();

    res.status(200).json({
      success: true,
      message: 'Đã gửi khiếu nại. Admin sẽ xem xét và xử lý.',
      data: transaction,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Lỗi không xác định';
    res.status(500).json({ success: false, message: 'Lỗi server', error: message });
  }
};

// --- ADM: ADMIN XỬ LÝ KHIẾU NẠI ---
export const adminResolveDispute = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const transactionId = req.params.id;
    const { resolution } = req.body; // 'REFUND' | 'DISBURSE'

    if (!['REFUND', 'DISBURSE'].includes(resolution)) {
      res.status(400).json({
        success: false,
        message: 'Resolution phải là REFUND hoặc DISBURSE',
      });
      return;
    }

    const transaction = await Transaction.findOne({
      _id: transactionId,
      status: 'DISPUTED',
    });

    if (!transaction) {
      res.status(404).json({
        success: false,
        message: 'Không tìm thấy giao dịch đang khiếu nại',
      });
      return;
    }

    const escrow = await EscrowLedger.findOne({
      transactionId: transaction._id,
      status: 'HOLDING',
    });

    if (resolution === 'REFUND') {
      // Đánh dấu escrow đã hoàn tiền — admin xử lý chuyển khoản thủ công
      if (escrow) {
        escrow.status = 'REFUNDED';
        escrow.refundedAt = new Date();
        escrow.refundReason = 'Admin xử lý khiếu nại — hoàn tiền';
        await escrow.save();
      }

      transaction.status = 'REFUNDED';
      transaction.refundReason = 'Admin xử lý khiếu nại — hoàn tiền';
      transaction.refundedAt = new Date();
      await transaction.save();

      // Khôi phục tồn kho
      const post = await Post.findById(transaction.postId);
      if (post) {
        post.remainingQuantity += transaction.quantity;
        if (post.status === 'OUT_OF_STOCK') post.status = 'AVAILABLE';
        await post.save();
      }

      res.status(200).json({
        success: true,
        message: 'Đã hoàn tiền cho buyer',
        data: transaction,
      });
    } else {
      // Giải ngân cho store
      if (escrow) {
        escrow.status = 'DISBURSED';
        escrow.disbursedAt = new Date();
        await escrow.save();
      }

      transaction.status = 'COMPLETED';
      await transaction.save();

      res.status(200).json({
        success: true,
        message: 'Đã giải ngân cho store',
        data: transaction,
      });
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Lỗi không xác định';
    res.status(500).json({ success: false, message: 'Lỗi server', error: message });
  }
};

// --- DEV ONLY: Hoàn tất giao dịch không cần quét QR (dùng khi test 1 mình) ---
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

    // Cho phép complete từ ACCEPTED (P2P) hoặc ESCROWED (B2C)
    if (!['ACCEPTED', 'ESCROWED'].includes(transaction.status)) {
      res.status(400).json({
        success: false,
        message: `Giao dịch đang ở trạng thái ${transaction.status}, không thể hoàn tất. Cần ACCEPTED (P2P) hoặc ESCROWED (B2C).`,
      });
      return;
    }

    transaction.status = 'COMPLETED';
    await transaction.save();

    // Giải ngân escrow nếu là đơn B2C
    if (transaction.type === 'ORDER') {
      const escrow = await EscrowLedger.findOne({
        transactionId: transaction._id,
        status: 'HOLDING',
      });
      if (escrow) {
        escrow.status = 'DISBURSED';
        escrow.disbursedAt = new Date();
        await escrow.save();
      }
    }

    // Cập nhật Post nếu hết hàng
    const post = await Post.findById(transaction.postId);
    if (post && post.remainingQuantity === 0) {
      post.status = 'HIDDEN';
      await post.save();
    }

    // Cộng điểm GreenPoint
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

    // Trigger TRANSACTION_COMPLETED badge check cho cả 2 bên
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

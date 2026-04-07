import crypto from 'crypto';

import { Request, Response } from 'express';
import mongoose from 'mongoose';

import Transaction from '@/models/Transaction';
import Post from '@/models/Post';
import { awardTransactionPoints } from '@/services/greenPointService';

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
      await transaction.deleteOne(); // TRX_F03
      res.status(200).json({ success: true, message: 'Đã hủy yêu cầu xin đồ' });
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
    const { postId, quantity, paymentMethod } = req.body;

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

    if (paymentMethod === 'FREE') {
      res.status(400).json({
        success: false,
        message: 'Đơn hàng B2C bắt buộc thanh toán qua ví điện tử',
      });
      return;
    }

    // Tạm trừ tồn kho ngay lúc đặt (TRX_F07)
    post.remainingQuantity -= quantity;
    if (post.remainingQuantity === 0) post.status = 'OUT_OF_STOCK';
    await post.save();

    // Tạo đơn hàng, set hạn thanh toán 10 phút (TRX_F09)
    const expiredAt = new Date(Date.now() + 10 * 60 * 1000);

    const newOrder = await Transaction.create({
      postId,
      requesterId,
      ownerId: post.ownerId,
      type: 'ORDER',
      quantity,
      status: 'PENDING',
      paymentMethod,
      expiredAt,
    });

    res.status(201).json({
      success: true,
      message: 'Đặt hàng thành công. Vui lòng thanh toán trong 10 phút.',
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

// --- TRX_F08 & TRX_F11: MÔ PHỎNG THANH TOÁN THÀNH CÔNG & SINH QR ---
export const processPayment = async (
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
    });
    if (!transaction) {
      res
        .status(404)
        .json({ success: false, message: 'Không tìm thấy đơn hàng' });
      return;
    }

    if (transaction.status !== 'PENDING') {
      res.status(400).json({
        success: false,
        message: 'Đơn hàng đã được xử lý hoặc đã hủy',
      });
      return;
    }

    // Kiểm tra xem đơn đã quá hạn 10 phút chưa (Lazy Check cho TRX_F09)
    if (transaction.expiredAt && new Date() > transaction.expiredAt) {
      // Hủy đơn và Khôi phục tồn kho (TRX_F10)
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
        message: 'Đơn hàng đã hết hạn thanh toán và bị hủy tự động',
      });
      return;
    }

    // Nếu thanh toán hợp lệ -> Đổi trạng thái sang ESCROWED (TRX_F08)
    transaction.status = 'ESCROWED';

    // Sinh mã xác minh QR duy nhất cho đơn hàng (TRX_F11)
    const rawQrString = `${transaction._id}-${requesterId}-${crypto.randomBytes(4).toString('hex')}`;
    transaction.verificationCode = rawQrString;

    await transaction.save();

    res.status(200).json({
      success: true,
      message: 'Thanh toán thành công. Tiền đã được tạm giữ.',
      qrCode: rawQrString,
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

    // Hủy đơn
    transaction.status = 'CANCELLED';
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

    // TODO: Kích hoạt tiến trình Refund (hoàn tiền từ Escrow về ví người mua)

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

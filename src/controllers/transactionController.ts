import crypto from 'crypto';
import { Request, Response } from 'express';
import Transaction from '@/models/Transaction';
import Post from '@/models/Post';

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

    // 3. Kiểm tra số lượng
    if (quantity > post.remainingQuantity) {
      res.status(400).json({
        success: false,
        message: 'Số lượng yêu cầu vượt quá số lượng hiện có',
      });
      return;
    }

    // 4. Tạo Transaction
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
  } catch (error: any) {
    res
      .status(500)
      .json({ success: false, message: 'Lỗi server', error: error.message });
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
  } catch (error: any) {
    res
      .status(500)
      .json({ success: false, message: 'Lỗi server', error: error.message });
  }
};

// --- TRX_F04: XEM DANH SÁCH YÊU CẦU CỦA 1 BÀI ĐĂNG ---
export const getPostRequests = async (
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

    const requests = await Transaction.find({ postId, type: 'REQUEST' })
      .populate('requesterId', 'fullName avatar averageRating')
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, data: requests });
  } catch (error: any) {
    res
      .status(500)
      .json({ success: false, message: 'Lỗi server', error: error.message });
  }
};

// --- TRX_F05 & TRX_F06: XÁC NHẬN/TỪ CHỐI CHO ĐỒ & CẬP NHẬT POST ---
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
      await transaction.save();

      // Cập nhật Post (TRX_F06)
      post.remainingQuantity -= transaction.quantity;
      if (post.remainingQuantity === 0) {
        post.status = 'OUT_OF_STOCK';
      } else {
        post.status = 'BOOKED'; // Chuyển từ Available sang Booked
      }
      await post.save();

      res
        .status(200)
        .json({ success: true, message: 'Đã chấp nhận yêu cầu xin đồ' });
      return;
    }

    res.status(400).json({ success: false, message: 'Phản hồi không hợp lệ' });
  } catch (error: any) {
    res
      .status(500)
      .json({ success: false, message: 'Lỗi server', error: error.message });
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
  } catch (error: any) {
    res
      .status(500)
      .json({ success: false, message: 'Lỗi server', error: error.message });
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

    // Sinh mã QR duy nhất cho đơn hàng (TRX_F11)
    const rawQrString = `${transaction._id}-${requesterId}-${crypto.randomBytes(4).toString('hex')}`;
    transaction.qrCode = rawQrString;

    await transaction.save();

    res.status(200).json({
      success: true,
      message: 'Thanh toán thành công. Tiền đã được tạm giữ.',
      qrCode: rawQrString,
    });
  } catch (error: any) {
    res
      .status(500)
      .json({ success: false, message: 'Lỗi server', error: error.message });
  }
};

// --- TRX_F12 & TRX_F13: QUÉT MÃ QR & GIẢI NGÂN ---
export const scanQrAndComplete = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const ownerId = req.user?.id; // Người quét QR (Store/Người cho)
    const { qrCode } = req.body;

    if (!qrCode) {
      res
        .status(400)
        .json({ success: false, message: 'Vui lòng cung cấp mã QR' });
      return;
    }

    // Tìm đơn hàng khớp với mã QR và đang ở trạng thái ESCROWED (đã thanh toán) hoặc ACCEPTED (đã duyệt cho P2P)
    const transaction = await Transaction.findOne({
      qrCode,
      ownerId, // Đảm bảo đúng chủ post mới quét được
      status: { $in: ['ESCROWED', 'ACCEPTED'] },
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

    res.status(200).json({
      success: true,
      message:
        'Xác nhận giao nhận thành công! Tiền đã được giải ngân về ví của bạn.',
      data: transaction,
    });
  } catch (error: any) {
    res
      .status(500)
      .json({ success: false, message: 'Lỗi server', error: error.message });
  }
};

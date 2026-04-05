import { Request, Response } from 'express';
import User from '@/models/User';
import EmailVerificationCode from '@/models/EmailVerificationCode';
import { sendVerificationEmail } from '@/utils/emailVerification';

const CODE_LENGTH = 6;
const CODE_EXPIRE_MINUTES = 10;
const MAX_SEND_PER_MINUTE = 3;

function generateNumericCode(length: number): string {
  let code = '';
  for (let i = 0; i < length; i += 1) {
    code += Math.floor(Math.random() * 10).toString();
  }
  return code;
}

// --- Gửi mã xác minh email ---
export const sendEmailVerificationCode = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Bạn cần đăng nhập để thực hiện thao tác này',
      });
      return;
    }

    const user = await User.findById(userId).select(
      'email authProvider isEmailVerified'
    );

    if (!user) {
      res.status(404).json({
        success: false,
        message: 'Không tìm thấy người dùng',
      });
      return;
    }

    if (user.isEmailVerified) {
      res.status(400).json({
        success: false,
        message: 'Email đã được xác minh trước đó',
        errorCode: 'ALREADY_VERIFIED',
      });
      return;
    }

    // Rate limit
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
    const recentCount = await EmailVerificationCode.countDocuments({
      userId,
      createdAt: { $gte: oneMinuteAgo },
    });

    if (recentCount >= MAX_SEND_PER_MINUTE) {
      res.status(429).json({
        success: false,
        message:
          'Bạn đã gửi mã quá nhiều lần. Vui lòng thử lại sau khoảng 1 phút',
      });
      return;
    }

    const code = generateNumericCode(CODE_LENGTH);
    const expiresAt = new Date(
      Date.now() + CODE_EXPIRE_MINUTES * 60 * 1000
    );

    // Vô hiệu các mã cũ
    await EmailVerificationCode.updateMany(
      { userId, usedAt: null },
      { $set: { usedAt: new Date() } }
    );

    const codeDoc = await EmailVerificationCode.create({
      userId,
      code,
      expiresAt,
    });

    try {
      await sendVerificationEmail({
        email: user.email,
        code,
        expiresInMinutes: CODE_EXPIRE_MINUTES,
      });
    } catch (sendError) {
      await EmailVerificationCode.findByIdAndDelete(codeDoc._id);
      throw sendError;
    }

    res.status(200).json({
      success: true,
      message: 'Đã gửi mã xác minh đến email của bạn',
      data: {
        expiresInMinutes: CODE_EXPIRE_MINUTES,
      },
    });
  } catch (error: unknown) {
    console.error('sendEmailVerificationCode error:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Không thể gửi mã xác minh';

    res.status(500).json({
      success: false,
      message: 'Lỗi server khi gửi mã xác minh',
      error: errorMessage,
    });
  }
};

// --- Xác minh email bằng mã ---
export const verifyEmail = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { code } = req.body;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Bạn cần đăng nhập để thực hiện thao tác này',
      });
      return;
    }

    if (
      typeof code !== 'string' ||
      !new RegExp(`^\\d{${CODE_LENGTH}}$`).test(code)
    ) {
      res.status(400).json({
        success: false,
        message: `Mã xác minh phải gồm đúng ${CODE_LENGTH} chữ số`,
      });
      return;
    }

    const user = await User.findById(userId).select('isEmailVerified');

    if (!user) {
      res.status(404).json({
        success: false,
        message: 'Không tìm thấy người dùng',
      });
      return;
    }

    if (user.isEmailVerified) {
      res.status(400).json({
        success: false,
        message: 'Email đã được xác minh trước đó',
        errorCode: 'ALREADY_VERIFIED',
      });
      return;
    }

    const now = new Date();
    const codeRecord = await EmailVerificationCode.findOne({
      userId,
      code,
      usedAt: null,
      expiresAt: { $gt: now },
    }).sort({ createdAt: -1 });

    if (!codeRecord) {
      res.status(400).json({
        success: false,
        message: 'Mã xác minh không hợp lệ hoặc đã hết hạn',
      });
      return;
    }

    // Đánh dấu mã đã dùng
    codeRecord.usedAt = now;
    await codeRecord.save();

    // Cập nhật user
    user.isEmailVerified = true;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Xác minh email thành công',
    });
  } catch (error: unknown) {
    console.error('verifyEmail error:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Xác minh email thất bại';

    res.status(500).json({
      success: false,
      message: 'Lỗi server',
      error: errorMessage,
    });
  }
};

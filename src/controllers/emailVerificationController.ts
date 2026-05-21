import { Request, Response } from 'express';
import {
  initiateEmailVerification,
  confirmEmailVerification,
  EmailVerificationError,
} from '@/services/emailVerificationService';

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

    const result = await initiateEmailVerification(userId);

    res.status(200).json({
      success: true,
      message: 'Đã gửi mã xác minh đến email của bạn',
      data: result,
    });
  } catch (error: unknown) {
    if (error instanceof EmailVerificationError) {
      res.status(error.statusCode).json({
        success: false,
        message: error.message,
        ...(error.errorCode && { errorCode: error.errorCode }),
      });
      return;
    }
    const errorMessage =
      error instanceof Error ? error.message : 'Không thể gửi mã xác minh';
    res.status(500).json({
      success: false,
      message: 'Lỗi server khi gửi mã xác minh',
      error: errorMessage,
    });
  }
};

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

    await confirmEmailVerification(userId, code);

    res.status(200).json({
      success: true,
      message: 'Xác minh email thành công',
    });
  } catch (error: unknown) {
    if (error instanceof EmailVerificationError) {
      res.status(error.statusCode).json({
        success: false,
        message: error.message,
        ...(error.errorCode && { errorCode: error.errorCode }),
      });
      return;
    }
    const errorMessage =
      error instanceof Error ? error.message : 'Xác minh email thất bại';
    res.status(500).json({
      success: false,
      message: 'Lỗi server',
      error: errorMessage,
    });
  }
};

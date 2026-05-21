import { Request, Response } from 'express';
import {
  AuthServiceError,
  initiateRegistration,
  verifyRegistrationCode,
  completeRegistration,
  loginWithPassword,
  loginWithGoogle,
  getUserById,
  finishProfile,
  updateUserProfile,
  updateUserLocation,
  applyForStore,
  resubmitKycDocuments,
  setGooglePassword,
  changeUserPassword,
} from '@/services/authService';
import { softDeleteUser, SoftDeleteError } from '@/services/softDeleteService';
import { checkAndAwardBadges } from '@/services/badgeService';
import { getImpactStats, UserServiceError } from '@/services/userService';
import logger from '@/utils/logger';

// --- BƯỚC 1: GỬI MÃ XÁC MINH EMAIL (Chưa tạo account) ---
export const registerSendCode = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { email, password, fullName, phoneNumber } = req.body;

    const result = await initiateRegistration({
      email,
      password,
      fullName,
      phoneNumber,
    });

    res.status(200).json({
      success: true,
      message: 'Đã gửi mã xác minh đến email của bạn',
      data: result,
    });
  } catch (error: unknown) {
    if (error instanceof AuthServiceError) {
      res
        .status(error.statusCode)
        .json({ success: false, message: error.message });
      return;
    }
    const errorMessage = error instanceof Error ? error.message : 'Lỗi server';
    res.status(500).json({
      success: false,
      message: 'Lỗi server khi gửi mã xác minh',
      error: errorMessage,
    });
  }
};

// --- CHỈ XÁC MINH MÃ (Không tạo account) ---
export const verifyCodeOnly = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { email, code } = req.body;
    const valid = await verifyRegistrationCode(email, code);

    if (!valid) {
      res.status(400).json({
        success: false,
        message: 'Mã xác minh không hợp lệ hoặc đã hết hạn',
      });
      return;
    }

    res.status(200).json({ success: true, message: 'Mã xác minh hợp lệ' });
  } catch {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

// --- BƯỚC 2: XÁC MINH MÃ + TẠO ACCOUNT ---
export const registerVerify = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { email, code } = req.body;
    const result = await completeRegistration({ email, code });

    res.status(201).json({
      success: true,
      message: 'Đăng ký tài khoản thành công',
      token: result.token,
      data: result.user,
      onboardingRequired: result.onboardingRequired,
    });
  } catch (error: unknown) {
    if (error instanceof AuthServiceError) {
      res
        .status(error.statusCode)
        .json({ success: false, message: error.message });
      return;
    }
    const errorMessage = error instanceof Error ? error.message : 'Lỗi server';
    res
      .status(500)
      .json({ success: false, message: 'Lỗi server', error: errorMessage });
  }
};

// --- API ĐĂNG NHẬP ---
export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;
    const result = await loginWithPassword({ email, password });

    res.status(200).json({
      success: true,
      message: 'Đăng nhập thành công',
      token: result.token,
      data: result.user,
      onboardingRequired: result.onboardingRequired,
    });
  } catch (error: unknown) {
    if (error instanceof AuthServiceError) {
      res
        .status(error.statusCode)
        .json({ success: false, message: error.message });
      return;
    }
    const errorMessage = error instanceof Error ? error.message : 'Lỗi server';
    res
      .status(500)
      .json({ success: false, message: 'Lỗi server', error: errorMessage });
  }
};

// --- API ĐĂNG NHẬP BẰNG GOOGLE ---
export const googleLogin = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { idToken } = req.body;
    const result = await loginWithGoogle(idToken);

    res.status(200).json({
      success: true,
      message: 'Đăng nhập Google thành công',
      token: result.token,
      data: result.user,
      onboardingRequired: result.onboardingRequired,
    });
  } catch (error: unknown) {
    if (error instanceof AuthServiceError) {
      res
        .status(error.statusCode)
        .json({ success: false, message: error.message });
      return;
    }
    const errorMessage =
      error instanceof Error ? error.message : 'Đăng nhập Google thất bại';
    res.status(400).json({
      success: false,
      message: 'Đăng nhập Google thất bại',
      error: errorMessage,
    });
  }
};

// --- API HOÀN THIỆN HỒ SƠ SAU ĐĂNG NHẬP GOOGLE ---
export const completeProfile = async (
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

    const { phoneNumber, defaultAddress } = req.body;
    const result = await finishProfile({ userId, phoneNumber, defaultAddress });

    res.status(200).json({
      success: true,
      message: 'Hoàn thiện hồ sơ thành công',
      data: result.user,
      onboardingRequired: result.onboardingRequired,
    });

    if (!result.onboardingRequired) {
      checkAndAwardBadges(userId, 'PROFILE_COMPLETED').catch((err) => {
        logger.warn(
          '[AuthController] badge check (PROFILE_COMPLETED) failed:',
          err
        );
      });
    }
  } catch (error: unknown) {
    if (error instanceof AuthServiceError) {
      res
        .status(error.statusCode)
        .json({ success: false, message: error.message });
      return;
    }
    const errorMessage =
      error instanceof Error ? error.message : 'Hoàn thiện hồ sơ thất bại';
    res
      .status(500)
      .json({ success: false, message: 'Lỗi server', error: errorMessage });
  }
};

// --- API ĐĂNG XUẤT ---
export const logout = async (_req: Request, res: Response): Promise<void> => {
  res.status(200).json({ success: true, message: 'Đăng xuất thành công' });
};

// --- API THIẾT LẬP MẬT KHẨU CHO USER GOOGLE ---
export const setPassword = async (
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

    const { newPassword } = req.body;
    const user = await setGooglePassword({ userId, newPassword });

    res.status(200).json({
      success: true,
      message: 'Thiết lập mật khẩu thành công',
      data: user,
    });
  } catch (error: unknown) {
    if (error instanceof AuthServiceError) {
      res
        .status(error.statusCode)
        .json({ success: false, message: error.message });
      return;
    }
    const errorMessage =
      error instanceof Error ? error.message : 'Thiết lập mật khẩu thất bại';
    res
      .status(500)
      .json({ success: false, message: 'Lỗi server', error: errorMessage });
  }
};

// --- API LẤY THÔNG TIN NGƯỜI DÙNG HIỆN TẠI ---
export const getMe = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Bạn cần đăng nhập để thực hiện thao tác này',
      });
      return;
    }

    const user = await getUserById(userId);

    if (!user) {
      res
        .status(404)
        .json({ success: false, message: 'Không tìm thấy người dùng' });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Lấy thông tin người dùng thành công',
      data: user,
    });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Lấy thông tin thất bại';
    res
      .status(500)
      .json({ success: false, message: 'Lỗi server', error: errorMessage });
  }
};

// --- API CẬP NHẬT HỒ SƠ NGƯỜI DÙNG ---
export const updateProfile = async (
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

    const {
      fullName,
      phoneNumber,
      defaultAddress,
      avatar,
      storeInfo,
      paymentInfo,
    } = req.body;
    const user = await updateUserProfile({
      userId,
      updates: {
        fullName,
        phoneNumber,
        defaultAddress,
        avatar,
        storeInfo,
        paymentInfo,
      },
    });

    res.status(200).json({
      success: true,
      message: 'Cập nhật hồ sơ thành công',
      data: user,
    });

    const isCompleted = Boolean(
      (user as Record<string, unknown>).isProfileCompleted
    );
    if (isCompleted) {
      checkAndAwardBadges(userId, 'PROFILE_COMPLETED').catch((err) => {
        logger.warn(
          '[AuthController] badge check (PROFILE_COMPLETED) after updateProfile failed:',
          err
        );
      });
    }
  } catch (error: unknown) {
    if (error instanceof AuthServiceError) {
      res
        .status(error.statusCode)
        .json({ success: false, message: error.message });
      return;
    }
    const errorMessage =
      error instanceof Error ? error.message : 'Cập nhật hồ sơ thất bại';
    res
      .status(500)
      .json({ success: false, message: 'Lỗi server', error: errorMessage });
  }
};

// --- API CẬP NHẬT VỊ TRÍ NGƯỜI DÙNG ---
export const updateMyLocation = async (
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

    const { longitude, latitude } = req.body;
    const user = await updateUserLocation({ userId, longitude, latitude });

    res.status(200).json({
      success: true,
      message: 'Cập nhật vị trí thành công',
      data: user,
    });
  } catch (error: unknown) {
    if (error instanceof AuthServiceError) {
      res
        .status(error.statusCode)
        .json({ success: false, message: error.message });
      return;
    }
    const errorMessage =
      error instanceof Error ? error.message : 'Cập nhật vị trí thất bại';
    res
      .status(500)
      .json({ success: false, message: 'Lỗi server', error: errorMessage });
  }
};

// --- API ĐĂNG KÝ CỬA HÀNG ---
export const registerStore = async (
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

    const { storeInfo, kycDocuments, paymentInfo } = req.body;
    const user = await applyForStore({
      userId,
      storeInfo,
      kycDocuments,
      paymentInfo,
    });

    res.status(200).json({
      success: true,
      message:
        'Đã gửi đơn đăng ký cửa hàng thành công. Vui lòng chờ Admin xét duyệt.',
      data: user,
    });
  } catch (error: unknown) {
    if (error instanceof AuthServiceError) {
      res
        .status(error.statusCode)
        .json({ success: false, message: error.message });
      return;
    }
    const errorMessage =
      error instanceof Error ? error.message : 'Đăng ký cửa hàng thất bại';
    res
      .status(500)
      .json({ success: false, message: 'Lỗi server', error: errorMessage });
  }
};

// --- Nộp lại KYC docs ---
export const resubmitKyc = async (
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

    const { kycDocuments } = req.body;
    const user = await resubmitKycDocuments({ userId, kycDocuments });

    res.status(200).json({
      success: true,
      message: 'Đã nộp hồ sơ KYC mới. Vui lòng chờ Admin xét duyệt.',
      data: user,
    });
  } catch (error: unknown) {
    if (error instanceof AuthServiceError) {
      res
        .status(error.statusCode)
        .json({ success: false, message: error.message });
      return;
    }
    const errorMessage =
      error instanceof Error ? error.message : 'Nộp lại KYC thất bại';
    res
      .status(500)
      .json({ success: false, message: 'Lỗi server', error: errorMessage });
  }
};

// --- Xóa tài khoản của chính mình ---
export const deleteMyAccount = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ success: false, message: 'Bạn cần đăng nhập' });
      return;
    }

    await softDeleteUser(userId, userId);

    res.status(200).json({
      success: true,
      message:
        'Tài khoản của bạn đã được chuyển vào thùng rác. Liên hệ admin trong 30 ngày để khôi phục.',
    });
  } catch (error: unknown) {
    if (error instanceof SoftDeleteError) {
      res
        .status(error.statusCode)
        .json({ success: false, message: error.message });
      return;
    }
    const errorMessage = error instanceof Error ? error.message : 'Lỗi server';
    res
      .status(500)
      .json({ success: false, message: 'Lỗi server', error: errorMessage });
  }
};

// --- API ĐỔI MẬT KHẨU ---
export const changePassword = async (
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

    const { currentPassword, newPassword } = req.body;
    await changeUserPassword({ userId, currentPassword, newPassword });

    res.status(200).json({ success: true, message: 'Đổi mật khẩu thành công' });
  } catch (error: unknown) {
    if (error instanceof AuthServiceError) {
      res.status(error.statusCode).json({
        success: false,
        message: error.message,
        ...(error.errorCode && { errorCode: error.errorCode }),
      });
      return;
    }
    const errorMessage =
      error instanceof Error ? error.message : 'Đổi mật khẩu thất bại';
    res
      .status(500)
      .json({ success: false, message: 'Lỗi server', error: errorMessage });
  }
};

// --- HOME: Impact stats ---
export const getMyImpact = async (
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

    const stats = await getImpactStats(userId);
    res.status(200).json({ success: true, data: stats });
  } catch (error: unknown) {
    if (error instanceof UserServiceError) {
      res
        .status(error.statusCode)
        .json({ success: false, message: error.message });
      return;
    }
    const errorMessage = error instanceof Error ? error.message : 'Lỗi server';
    res
      .status(500)
      .json({ success: false, message: 'Lỗi server', error: errorMessage });
  }
};

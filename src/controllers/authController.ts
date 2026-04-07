import { Request, Response } from 'express';
import User from '@/models/User';
import PendingRegistration from '@/models/PendingRegistration';
import { hashPassword, comparePassword, generateToken } from '@/utils/auth';
import { verifyGoogleIdToken } from '@/utils/googleAuth';
import { sendVerificationEmail } from '@/utils/emailVerification';
import {
  deleteImageByUrl,
  deleteMultipleImagesByUrl,
} from '@/services/uploadService';

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

function hasRequiredProfileInfo(user: {
  phoneNumber?: string;
  defaultAddress?: string;
}): boolean {
  const hasPhoneNumber = Boolean(user.phoneNumber && user.phoneNumber.trim());
  const hasDefaultAddress = Boolean(
    user.defaultAddress && user.defaultAddress.trim()
  );

  return hasPhoneNumber && hasDefaultAddress;
}

function sanitizeUserData<
  TUser extends { toObject: () => Record<string, unknown> },
>(user: TUser): Record<string, unknown> {
  const userData = user.toObject();
  delete userData.password;
  return userData;
}

// --- BƯỚC 1: GỬI MÃ XÁC MINH EMAIL (Chưa tạo account) ---
export const registerSendCode = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { email, password, fullName, phoneNumber } = req.body;

    const normalizedEmail = email.toLowerCase();

    // Kiểm tra User đã tồn tại chưa
    const existingUser = await User.findOne({
      $or: [
        { email: normalizedEmail },
        ...(phoneNumber ? [{ phoneNumber }] : []),
      ],
    });

    if (existingUser) {
      if (existingUser.email === normalizedEmail) {
        const provider = existingUser.authProvider;
        if (provider === 'GOOGLE') {
          res.status(409).json({
            success: false,
            message:
              'Email này đã được đăng ký bằng Google. Vui lòng đăng nhập bằng Google.',
          });
        } else {
          res.status(409).json({
            success: false,
            message: 'Email này đã được đăng ký. Vui lòng đăng nhập.',
          });
        }
      } else {
        res.status(409).json({
          success: false,
          message: 'Số điện thoại đã được sử dụng',
        });
      }
      return;
    }

    // Rate limit: tối đa 3 lần/phút cho cùng email
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
    const recentCount = await PendingRegistration.countDocuments({
      email: normalizedEmail,
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

    // Hash password trước khi lưu tạm
    const hashedPassword = await hashPassword(password);
    const code = generateNumericCode(CODE_LENGTH);
    const expiresAt = new Date(Date.now() + CODE_EXPIRE_MINUTES * 60 * 1000);

    // Xóa các pending cũ của email này
    await PendingRegistration.deleteMany({ email: normalizedEmail });

    // Lưu thông tin đăng ký tạm + mã xác minh
    const pending = await PendingRegistration.create({
      email: normalizedEmail,
      fullName,
      phoneNumber: phoneNumber || '',
      hashedPassword,
      code,
      expiresAt,
    });

    // Gửi email xác minh
    try {
      await sendVerificationEmail({
        email: normalizedEmail,
        code,
        expiresInMinutes: CODE_EXPIRE_MINUTES,
      });
    } catch (sendError) {
      await PendingRegistration.findByIdAndDelete(pending._id);
      throw sendError;
    }

    res.status(200).json({
      success: true,
      message: 'Đã gửi mã xác minh đến email của bạn',
      data: { expiresInMinutes: CODE_EXPIRE_MINUTES },
    });
  } catch (error: unknown) {
    console.error('registerSendCode error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Lỗi server';

    res.status(500).json({
      success: false,
      message: 'Lỗi server khi gửi mã xác minh',
      error: errorMessage,
    });
  }
};

// --- CHỈ XÁC MINH MÃ (Không tạo account — dùng cho admin tạo tài khoản) ---
export const verifyCodeOnly = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { email, code } = req.body;
    const normalizedEmail = email.toLowerCase();

    const pending = await PendingRegistration.findOne({
      email: normalizedEmail,
      code,
      expiresAt: { $gt: new Date() },
    });

    if (!pending) {
      res.status(400).json({
        success: false,
        message: 'Mã xác minh không hợp lệ hoặc đã hết hạn',
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Mã xác minh hợp lệ',
    });
  } catch (error: unknown) {
    console.error('verifyCodeOnly error:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi server',
    });
  }
};

// --- BƯỚC 2: XÁC MINH MÃ + TẠO ACCOUNT ---
export const registerVerify = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { email, code } = req.body;
    const normalizedEmail = email.toLowerCase();

    // Tìm pending registration còn hiệu lực
    const pending = await PendingRegistration.findOne({
      email: normalizedEmail,
      code,
      expiresAt: { $gt: new Date() },
    });

    if (!pending) {
      res.status(400).json({
        success: false,
        message: 'Mã xác minh không hợp lệ hoặc đã hết hạn',
      });
      return;
    }

    // Kiểm tra lại email chưa bị đăng ký (race condition)
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      await PendingRegistration.deleteMany({ email: normalizedEmail });
      res.status(409).json({
        success: false,
        message: 'Email đã được sử dụng',
      });
      return;
    }

    // Tạo User thật
    const isProfileCompleted = hasRequiredProfileInfo({
      phoneNumber: pending.phoneNumber,
      defaultAddress: '',
    });

    const newUser = await User.create({
      email: normalizedEmail,
      password: pending.hashedPassword,
      fullName: pending.fullName,
      phoneNumber: pending.phoneNumber || undefined,
      defaultAddress: '',
      authProvider: 'LOCAL',
      isEmailVerified: true, // Đã xác minh qua code
      isProfileCompleted,
      role: 'USER',
    });

    // Dọn dẹp pending
    await PendingRegistration.deleteMany({ email: normalizedEmail });

    // Auto-login: tạo token
    const token = generateToken(newUser._id.toString(), newUser.role);
    const userToReturn = sanitizeUserData(newUser);

    res.status(201).json({
      success: true,
      message: 'Đăng ký tài khoản thành công',
      token,
      data: userToReturn,
      onboardingRequired: !newUser.isProfileCompleted,
    });
  } catch (error: unknown) {
    console.error('registerVerify error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Lỗi server';

    res.status(500).json({
      success: false,
      message: 'Lỗi server',
      error: errorMessage,
    });
  }
};

// --- API ĐĂNG NHẬP (Dùng chung cho ADMIN, USER, STORE) ---
export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    // 1. Tìm user và ép Mongoose trả về cả trường password
    const user = await User.findOne({ email: email.toLowerCase() }).select(
      '+password'
    );

    if (!user) {
      res
        .status(404)
        .json({ success: false, message: 'Tài khoản không tồn tại' });
      return;
    }

    // 2. Kiểm tra tài khoản có bị khóa không
    if (user.status === 'BANNED') {
      res
        .status(403)
        .json({ success: false, message: 'Tài khoản của bạn đã bị khóa' });
      return;
    }

    if (user.authProvider === 'GOOGLE' && !user.password) {
      res.status(400).json({
        success: false,
        message:
          'Tài khoản này đăng ký bằng Google. Vui lòng đăng nhập bằng Google',
      });
      return;
    }

    // 3. Kiểm tra mật khẩu
    if (!user.password) {
      res.status(400).json({
        success: false,
        message: 'Tài khoản chưa có mật khẩu, vui lòng đăng nhập bằng Google',
      });
      return;
    }

    const isMatch = await comparePassword(password, user.password);
    if (!isMatch) {
      res
        .status(401)
        .json({ success: false, message: 'Mật khẩu không chính xác' });
      return;
    }

    // 4. Tạo Token và trả về
    const token = generateToken(user._id.toString(), user.role);

    const userProfile = sanitizeUserData(user);

    res.status(200).json({
      success: true,
      message: 'Đăng nhập thành công',
      token,
      data: userProfile,
      onboardingRequired: !user.isProfileCompleted,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Lỗi server';

    res
      .status(500)
      .json({ success: false, message: 'Lỗi server', error: errorMessage });
  }
};

// --- API ĐĂNG NHẬP BẰNG GOOGLE (Mobile OAuth) ---
export const googleLogin = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { idToken } = req.body;
    const googleUser = await verifyGoogleIdToken(idToken);

    let user = await User.findOne({
      $or: [{ googleId: googleUser.googleId }, { email: googleUser.email }],
    }).select('+password');

    if (!user) {
      const isProfileCompleted = hasRequiredProfileInfo({
        phoneNumber: '',
        defaultAddress: '',
      });

      user = await User.create({
        email: googleUser.email,
        googleId: googleUser.googleId,
        authProvider: 'GOOGLE',
        isEmailVerified: true,
        isProfileCompleted,
        fullName: googleUser.fullName,
        avatar: googleUser.avatar || '',
        role: 'USER',
      });
    } else {
      if (user.status === 'BANNED') {
        res
          .status(403)
          .json({ success: false, message: 'Tài khoản của bạn đã bị khóa' });
        return;
      }

      let shouldSave = false;

      if (!user.googleId) {
        user.googleId = googleUser.googleId;
        shouldSave = true;
      }

      if (!user.avatar && googleUser.avatar) {
        user.avatar = googleUser.avatar;
        shouldSave = true;
      }

      if (!user.fullName && googleUser.fullName) {
        user.fullName = googleUser.fullName;
        shouldSave = true;
      }

      const computedProfileCompleted = hasRequiredProfileInfo(user);
      if (user.isProfileCompleted !== computedProfileCompleted) {
        user.isProfileCompleted = computedProfileCompleted;
        shouldSave = true;
      }

      if (shouldSave) {
        await user.save();
      }
    }

    const token = generateToken(user._id.toString(), user.role);
    const userProfile = sanitizeUserData(user);

    res.status(200).json({
      success: true,
      message: 'Đăng nhập Google thành công',
      token,
      data: userProfile,
      onboardingRequired: !user.isProfileCompleted,
    });
  } catch (error: unknown) {
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
    const { phoneNumber, defaultAddress } = req.body;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Bạn cần đăng nhập để thực hiện thao tác này',
      });
      return;
    }

    const duplicatePhoneUser = await User.findOne({
      phoneNumber,
      _id: { $ne: userId },
    });

    if (duplicatePhoneUser) {
      res.status(409).json({
        success: false,
        message: 'Số điện thoại đã được sử dụng',
      });
      return;
    }

    const isProfileCompleted = hasRequiredProfileInfo({
      phoneNumber,
      defaultAddress,
    });

    const user = await User.findByIdAndUpdate(
      userId,
      {
        $set: {
          phoneNumber,
          defaultAddress,
          isProfileCompleted,
        },
      },
      { new: true }
    );

    if (!user) {
      res.status(404).json({
        success: false,
        message: 'Không tìm thấy người dùng',
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Hoàn thiện hồ sơ thành công',
      data: sanitizeUserData(user),
      onboardingRequired: !user.isProfileCompleted,
    });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Hoàn thiện hồ sơ thất bại';

    res.status(500).json({
      success: false,
      message: 'Lỗi server',
      error: errorMessage,
    });
  }
};

// --- API ĐĂNG XUẤT ---
export const logout = async (req: Request, res: Response): Promise<void> => {
  try {
    // JWT là stateless nên server không cần invalidate token.
    // Client sẽ tự xoá token ở local storage.
    // Endpoint này tồn tại để đảm bảo API contract rõ ràng
    // và có thể mở rộng thêm logic (blacklist token, log activity...) sau này.
    res.status(200).json({
      success: true,
      message: 'Đăng xuất thành công',
    });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Đăng xuất thất bại';

    res.status(500).json({
      success: false,
      message: 'Lỗi server',
      error: errorMessage,
    });
  }
};

// --- API THIẾT LẬP MẬT KHẨU CHO USER GOOGLE ---
export const setPassword = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { newPassword } = req.body;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Bạn cần đăng nhập để thực hiện thao tác này',
      });
      return;
    }

    const user = await User.findById(userId).select('+password');

    if (!user) {
      res.status(404).json({
        success: false,
        message: 'Không tìm thấy người dùng',
      });
      return;
    }

    if (user.authProvider !== 'GOOGLE') {
      res.status(400).json({
        success: false,
        message: 'Chỉ tài khoản Google mới dùng endpoint này',
      });
      return;
    }

    if (user.password) {
      res.status(409).json({
        success: false,
        message: 'Tài khoản đã có mật khẩu',
      });
      return;
    }

    user.password = await hashPassword(newPassword);
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Thiết lập mật khẩu thành công',
      data: sanitizeUserData(user),
    });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Thiết lập mật khẩu thất bại';

    res.status(500).json({
      success: false,
      message: 'Lỗi server',
      error: errorMessage,
    });
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

    const user = await User.findById(userId);

    if (!user) {
      res.status(404).json({
        success: false,
        message: 'Không tìm thấy người dùng',
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Lấy thông tin người dùng thành công',
      data: sanitizeUserData(user),
    });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Lấy thông tin thất bại';

    res.status(500).json({
      success: false,
      message: 'Lỗi server',
      error: errorMessage,
    });
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

    // Kiểm tra trùng số điện thoại
    if (phoneNumber) {
      const duplicatePhoneUser = await User.findOne({
        phoneNumber,
        _id: { $ne: userId },
      });

      if (duplicatePhoneUser) {
        res.status(409).json({
          success: false,
          message: 'Số điện thoại đã được sử dụng',
        });
        return;
      }
    }

    const updateData: Record<string, unknown> = {};

    if (fullName !== undefined) updateData.fullName = fullName;
    if (phoneNumber !== undefined) updateData.phoneNumber = phoneNumber;
    if (defaultAddress !== undefined)
      updateData.defaultAddress = defaultAddress;
    if (avatar !== undefined) updateData.avatar = avatar;
    if (storeInfo !== undefined) updateData.storeInfo = storeInfo;
    if (paymentInfo !== undefined) updateData.paymentInfo = paymentInfo;

    // Tính toán lại isProfileCompleted
    const currentUser = await User.findById(userId);
    if (!currentUser) {
      res.status(404).json({
        success: false,
        message: 'Không tìm thấy người dùng',
      });
      return;
    }

    const mergedPhone =
      phoneNumber !== undefined ? phoneNumber : currentUser.phoneNumber;
    const mergedAddress =
      defaultAddress !== undefined
        ? defaultAddress
        : currentUser.defaultAddress;
    updateData.isProfileCompleted = hasRequiredProfileInfo({
      phoneNumber: mergedPhone,
      defaultAddress: mergedAddress,
    });

    // Xóa avatar cũ trên Cloudinary nếu đổi avatar mới
    if (
      avatar !== undefined &&
      currentUser.avatar &&
      avatar !== currentUser.avatar
    ) {
      deleteImageByUrl(currentUser.avatar).catch(() => {});
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { $set: updateData },
      { new: true }
    );

    if (!user) {
      res.status(404).json({
        success: false,
        message: 'Không tìm thấy người dùng',
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Cập nhật hồ sơ thành công',
      data: sanitizeUserData(user),
    });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Cập nhật hồ sơ thất bại';

    res.status(500).json({
      success: false,
      message: 'Lỗi server',
      error: errorMessage,
    });
  }
};

// --- API ĐĂNG KÝ CỬA HÀNG (Nâng cấp USER → STORE) ---
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

    const user = await User.findById(userId);

    if (!user) {
      res.status(404).json({
        success: false,
        message: 'Không tìm thấy người dùng',
      });
      return;
    }

    // Chỉ USER mới được đăng ký Store
    if (user.role === 'STORE') {
      res.status(409).json({
        success: false,
        message: 'Tài khoản của bạn đã là cửa hàng',
      });
      return;
    }

    if (user.role === 'ADMIN') {
      res.status(403).json({
        success: false,
        message: 'Tài khoản Admin không thể đăng ký cửa hàng',
      });
      return;
    }

    // Kiểm tra profile đã hoàn thiện chưa
    if (!user.isProfileCompleted) {
      res.status(400).json({
        success: false,
        message:
          'Vui lòng hoàn thiện hồ sơ cá nhân (số điện thoại, địa chỉ) trước khi đăng ký cửa hàng',
      });
      return;
    }

    // Kiểm tra đã có đơn đăng ký đang chờ duyệt
    if (user.status === 'PENDING_KYC') {
      res.status(409).json({
        success: false,
        message:
          'Bạn đã có đơn đăng ký cửa hàng đang chờ duyệt. Vui lòng chờ Admin xét duyệt.',
      });
      return;
    }

    const { storeInfo, kycDocuments, paymentInfo } = req.body;

    // Cập nhật thông tin Store và KYC; chuyển status → PENDING_KYC
    user.storeInfo = storeInfo;
    user.kycDocuments = kycDocuments;
    if (paymentInfo) user.paymentInfo = paymentInfo;
    user.kycStatus = 'PENDING';
    user.status = 'PENDING_KYC';
    // Chưa chuyển role → vẫn là USER cho đến khi Admin duyệt

    await user.save();

    res.status(200).json({
      success: true,
      message:
        'Đã gửi đơn đăng ký cửa hàng thành công. Vui lòng chờ Admin xét duyệt.',
      data: sanitizeUserData(user),
    });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Đăng ký cửa hàng thất bại';

    res.status(500).json({
      success: false,
      message: 'Lỗi server',
      error: errorMessage,
    });
  }
};

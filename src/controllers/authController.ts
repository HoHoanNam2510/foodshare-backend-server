import { Request, Response } from 'express';
import User from '@/models/User';
import { hashPassword, comparePassword, generateToken } from '@/utils/auth';
import { verifyGoogleIdToken } from '@/utils/googleAuth';

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

// --- API ĐĂNG KÝ (Chỉ dành cho USER và STORE) ---
export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, fullName, phoneNumber, defaultAddress, role } =
      req.body;

    // 2. Chặn quyền đăng ký ADMIN
    // Nếu client cố tình gửi role là ADMIN, chặn đứng ngay lập tức
    if (role === 'ADMIN') {
      res.status(403).json({
        success: false,
        message: 'Bạn không có quyền tạo tài khoản Quản trị viên',
      });
      return;
    }

    // 3. Kiểm tra User đã tồn tại chưa (Check cả email và số điện thoại nếu có)
    const existingUser = await User.findOne({
      $or: [
        { email: email.toLowerCase() },
        ...(phoneNumber ? [{ phoneNumber }] : []),
      ],
    });

    if (existingUser) {
      res.status(409).json({
        success: false,
        message: 'Email hoặc Số điện thoại đã được sử dụng',
      });
      return;
    }

    // 4. Mã hóa mật khẩu và tạo User
    const hashedPassword = await hashPassword(password);
    const isProfileCompleted = hasRequiredProfileInfo({
      phoneNumber,
      defaultAddress,
    });

    const newUser = await User.create({
      email: email.toLowerCase(),
      password: hashedPassword,
      fullName,
      phoneNumber,
      defaultAddress: defaultAddress || '',
      authProvider: 'LOCAL',
      isProfileCompleted,
      role: role || 'USER', // Mặc định là USER
    });

    // 5. Chuẩn bị dữ liệu trả về (ẩn password)
    const userToReturn = sanitizeUserData(newUser);

    res.status(201).json({
      success: true,
      message: 'Đăng ký tài khoản thành công',
      data: userToReturn,
      onboardingRequired: !newUser.isProfileCompleted,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Lỗi server';

    res
      .status(500)
      .json({ success: false, message: 'Lỗi server', error: errorMessage });
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
      kycDocuments,
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
    if (kycDocuments !== undefined) updateData.kycDocuments = kycDocuments;
    if (storeInfo !== undefined) updateData.storeInfo = storeInfo;

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

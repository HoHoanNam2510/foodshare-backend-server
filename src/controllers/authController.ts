import { Request, Response } from 'express';
import User from '@/models/User';
import { hashPassword, comparePassword, generateToken } from '@/utils/auth';

// --- API ĐĂNG KÝ (Chỉ dành cho USER và STORE) ---
export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, fullName, phoneNumber, role } = req.body;

    // 1. Kiểm tra dữ liệu đầu vào
    if (!email || !password || !fullName) {
      res.status(400).json({
        success: false,
        message: 'Vui lòng điền đầy đủ Email, Mật khẩu và Họ tên',
      });
      return;
    }

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

    const newUser = await User.create({
      email: email.toLowerCase(),
      password: hashedPassword,
      fullName,
      phoneNumber,
      role: role || 'USER', // Mặc định là USER
    });

    // 5. Chuẩn bị dữ liệu trả về (ẩn password)
    const userToReturn = newUser.toObject();
    delete userToReturn.password;

    res.status(201).json({
      success: true,
      message: 'Đăng ký tài khoản thành công',
      data: userToReturn,
    });
  } catch (error: any) {
    console.error('Lỗi Register:', error);
    res
      .status(500)
      .json({ success: false, message: 'Lỗi server', error: error.message });
  }
};

// --- API ĐĂNG NHẬP (Dùng chung cho ADMIN, USER, STORE) ---
export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res
        .status(400)
        .json({ success: false, message: 'Vui lòng nhập Email và Mật khẩu' });
      return;
    }

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

    // 3. Kiểm tra mật khẩu
    const isMatch = await comparePassword(password, user.password as string);
    if (!isMatch) {
      res
        .status(401)
        .json({ success: false, message: 'Mật khẩu không chính xác' });
      return;
    }

    // 4. Tạo Token và trả về
    const token = generateToken(user._id.toString(), user.role);

    const userProfile = user.toObject();
    delete userProfile.password;

    res.status(200).json({
      success: true,
      message: 'Đăng nhập thành công',
      token,
      data: userProfile,
    });
  } catch (error: any) {
    console.error('Lỗi Login:', error);
    res
      .status(500)
      .json({ success: false, message: 'Lỗi server', error: error.message });
  }
};

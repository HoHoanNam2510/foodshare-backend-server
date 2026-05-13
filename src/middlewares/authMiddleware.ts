// src/middlewares/authMiddleware.ts
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import User from '@/models/User';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_key_for_dev';

export interface AuthPayload {
  id: string;
  role: string;
}

// Mở rộng interface Request của Express để TypeScript không báo lỗi khi ta gán thêm req.user
declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

export const verifyAuth = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Lấy header authorization (Express mặc định chuyển thành chữ thường hoặc truy cập trực tiếp qua .authorization)
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      message: 'Không tìm thấy Token xác thực',
    });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthPayload;

    // Gắn thông tin user vừa giải mã được vào object request (req)
    // Để các Controller phía sau có thể lấy ra dùng (ví dụ: req.user.id)
    req.user = decoded;

    // Cấp phép cho request đi tiếp vào Controller
    next();
  } catch (error) {
    res.status(403).json({
      success: false,
      message: 'Token không hợp lệ hoặc đã hết hạn',
    });
    return;
  }
};

export const verifyAdmin = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      message: 'Bạn cần đăng nhập để thực hiện thao tác này',
    });
    return;
  }

  if (req.user.role !== 'ADMIN') {
    res.status(403).json({
      success: false,
      message: 'Bạn không có quyền truy cập tài nguyên này',
    });
    return;
  }

  next();
};

/**
 * Kiểm tra grace period KYC cho STORE accounts.
 * Nếu kycGracePeriodEndsAt đã qua → tự động khóa tài khoản (status=BANNED) và trả 403.
 * Phải dùng sau verifyAuth.
 */
export const verifyStoreActive = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  if (!req.user || req.user.role !== 'STORE') {
    next();
    return;
  }

  const user = await User.findById(req.user.id).select(
    'kycGracePeriodEndsAt status'
  );
  if (!user) {
    next();
    return;
  }

  if (user.kycGracePeriodEndsAt && new Date() > user.kycGracePeriodEndsAt) {
    await User.findByIdAndUpdate(user._id, { status: 'BANNED' });
    res.status(403).json({
      success: false,
      message:
        'Tài khoản cửa hàng đã bị khóa do không gia hạn xác minh KYC trong thời hạn.',
      errorCode: 'STORE_KYC_EXPIRED',
    });
    return;
  }

  next();
};

/**
 * Middleware tùy chọn: Nếu có Bearer token hợp lệ thì gắn req.user,
 * nếu không có hoặc token lỗi thì vẫn cho đi tiếp (không chặn).
 * Dùng cho các route public nhưng cần biết ai đang gọi (VD: getPostDetail kiểm tra owner).
 */
export const optionalAuth = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      req.user = jwt.verify(token, JWT_SECRET) as AuthPayload;
    } catch {
      // Token không hợp lệ → bỏ qua, không gắn user
    }
  }

  next();
};

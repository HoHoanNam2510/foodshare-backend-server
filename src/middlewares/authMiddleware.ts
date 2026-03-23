// src/middlewares/authMiddleware.ts
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

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

// src/utils/auth.ts
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_key_for_dev';
const EXPIRES_IN = '7d'; // Token sống được 7 ngày

// 1. Hàm băm (hash) mật khẩu
export const hashPassword = async (password: string) => {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
};

// 2. Hàm kiểm tra mật khẩu
export const comparePassword = async (password: string, hashed: string) => {
  return bcrypt.compare(password, hashed);
};

// 3. Hàm tạo JWT Token
export const generateToken = (
  userId: string | mongoose.Types.ObjectId,
  role: string
) => {
  return jwt.sign({ id: userId, role }, JWT_SECRET, {
    expiresIn: EXPIRES_IN,
  });
};

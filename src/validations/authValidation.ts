import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email('Email không hợp lệ'),
  password: z.string().min(6, 'Mật khẩu tối thiểu 6 ký tự'),
  fullName: z.string().min(1, 'Họ tên là bắt buộc'),
  phoneNumber: z.string().min(8, 'Số điện thoại không hợp lệ').optional(),
  defaultAddress: z.string().min(5, 'Địa chỉ mặc định không hợp lệ').optional(),
  role: z.enum(['USER', 'STORE']).optional(),
});

export const loginSchema = z.object({
  email: z.string().email('Email không hợp lệ'),
  password: z.string().min(1, 'Mật khẩu là bắt buộc'),
});

export const googleLoginSchema = z.object({
  idToken: z.string().min(1, 'idToken là bắt buộc'),
});

export const completeProfileSchema = z.object({
  phoneNumber: z.string().min(8, 'Số điện thoại không hợp lệ'),
  defaultAddress: z.string().min(5, 'Địa chỉ mặc định không hợp lệ'),
});

export const setPasswordSchema = z.object({
  newPassword: z.string().min(6, 'Mật khẩu mới tối thiểu 6 ký tự'),
});

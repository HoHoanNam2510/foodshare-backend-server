import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email('Email không hợp lệ'),
  password: z.string().min(6, 'Mật khẩu tối thiểu 6 ký tự'),
  fullName: z.string().min(1, 'Họ tên là bắt buộc'),
  phoneNumber: z.union([z.string().min(8, 'Số điện thoại không hợp lệ'), z.literal('')]).optional(),
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

export const registerVerifySchema = z.object({
  email: z.string().email('Email không hợp lệ'),
  code: z.string().regex(/^\d{6}$/, 'Mã xác minh phải gồm đúng 6 chữ số'),
});

export const verifyEmailSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Mã xác minh phải gồm đúng 6 chữ số'),
});

export const updateProfileSchema = z.object({
  fullName: z.string().min(1, 'Họ tên là bắt buộc').optional(),
  phoneNumber: z.string().min(8, 'Số điện thoại không hợp lệ').optional(),
  defaultAddress: z.string().min(5, 'Địa chỉ không hợp lệ').optional(),
  avatar: z.string().optional(),
  storeInfo: z
    .object({
      businessName: z.string().optional(),
      openHours: z.string().optional(),
      closeHours: z.string().optional(),
      description: z.string().optional(),
      businessAddress: z.string().optional(),
    })
    .optional(),
  kycDocuments: z.array(z.string()).optional(),
});

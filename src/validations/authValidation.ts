import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email('Email không hợp lệ'),
  password: z.string().min(6, 'Mật khẩu tối thiểu 6 ký tự'),
  fullName: z.string().min(1, 'Họ tên là bắt buộc'),
  phoneNumber: z.union([z.string().min(8, 'Số điện thoại không hợp lệ'), z.literal('')]).optional(),
  defaultAddress: z.string().min(5, 'Địa chỉ mặc định không hợp lệ').optional(),
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

export const registerStoreSchema = z.object({
  storeInfo: z.object({
    businessName: z.string().min(1, 'Tên cửa hàng là bắt buộc'),
    openHours: z.string().min(1, 'Giờ mở cửa là bắt buộc'),
    closeHours: z.string().min(1, 'Giờ đóng cửa là bắt buộc'),
    description: z.string().optional(),
    businessAddress: z.string().min(1, 'Địa chỉ cửa hàng là bắt buộc'),
  }),
  kycDocuments: z
    .array(z.string().min(1))
    .min(1, 'Cần ít nhất 1 tài liệu KYC'),
});

export const updateProfileSchema = z.object({
  fullName: z.string().min(1, 'Họ tên là bắt buộc').optional(),
  phoneNumber: z.string().min(8, 'Số điện thoại không hợp lệ').optional(),
  defaultAddress: z.string().min(1, 'Địa chỉ không được để trống').optional(),
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
});

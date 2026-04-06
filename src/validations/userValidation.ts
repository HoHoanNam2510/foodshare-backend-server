import { z } from 'zod';

const userRoleSchema = z.enum(['USER', 'STORE', 'ADMIN']);
const authProviderSchema = z.enum(['LOCAL', 'GOOGLE']);
const kycStatusSchema = z.enum(['PENDING', 'VERIFIED', 'REJECTED']);
const userStatusSchema = z.enum(['ACTIVE', 'BANNED', 'PENDING_KYC']);
const sortBySchema = z.enum([
  'createdAt',
  'updatedAt',
  'fullName',
  'email',
  'greenPoints',
  'averageRating',
]);
const sortOrderSchema = z.enum(['asc', 'desc']);

const locationSchema = z.object({
  type: z.literal('Point'),
  coordinates: z
    .tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)])
    .refine((coords) => coords.length === 2, {
      message: 'Tọa độ phải có dạng [longitude, latitude]',
    }),
});

const storeInfoSchema = z
  .object({
    businessName: z.string().min(1).optional(),
    openHours: z.string().min(1).optional(),
    closeHours: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    businessAddress: z.string().min(1).optional(),
  })
  .partial();

export const createUserSchema = z
  .object({
    email: z.string().email('Email không hợp lệ'),
    password: z.string().min(6, 'Mật khẩu tối thiểu 6 ký tự').optional(),
    googleId: z.string().min(1).optional(),
    authProvider: authProviderSchema.optional(),
    isProfileCompleted: z.boolean().optional(),
    role: userRoleSchema.optional(),
    fullName: z.string().min(1, 'Họ tên là bắt buộc'),
    avatar: z.string().url('Avatar phải là URL hợp lệ').optional(),
    phoneNumber: z.string().min(8, 'Số điện thoại không hợp lệ').optional(),
    defaultAddress: z
      .string()
      .min(5, 'Địa chỉ mặc định không hợp lệ')
      .optional(),
    location: locationSchema.optional(),
    kycStatus: kycStatusSchema.optional(),
    kycDocuments: z.array(z.string().min(1)).optional(),
    storeInfo: storeInfoSchema.optional(),
    greenPoints: z.number().min(0).optional(),
    averageRating: z.number().min(0).max(5).optional(),
    status: userStatusSchema.optional(),
  })
  .superRefine((data, ctx) => {
    const finalProvider =
      data.authProvider || (data.googleId ? 'GOOGLE' : 'LOCAL');

    if (finalProvider === 'LOCAL' && !data.password) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['password'],
        message: 'Tài khoản LOCAL bắt buộc có mật khẩu',
      });
    }
  });

export const updateUserSchema = z
  .object({
    email: z.string().email('Email không hợp lệ').optional(),
    password: z.string().min(6, 'Mật khẩu tối thiểu 6 ký tự').optional(),
    googleId: z.string().min(1).optional(),
    authProvider: authProviderSchema.optional(),
    isProfileCompleted: z.boolean().optional(),
    role: userRoleSchema.optional(),
    fullName: z.string().min(1).optional(),
    avatar: z.string().url('Avatar phải là URL hợp lệ').optional(),
    phoneNumber: z.string().min(8, 'Số điện thoại không hợp lệ').optional(),
    defaultAddress: z
      .string()
      .min(5, 'Địa chỉ mặc định không hợp lệ')
      .optional(),
    location: locationSchema.optional(),
    kycStatus: kycStatusSchema.optional(),
    kycDocuments: z.array(z.string().min(1)).optional(),
    storeInfo: storeInfoSchema.optional(),
    greenPoints: z.number().min(0).optional(),
    averageRating: z.number().min(0).max(5).optional(),
    status: userStatusSchema.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Body cập nhật không được để trống',
  });

export const userIdParamSchema = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i, 'User ID không hợp lệ'),
});

export const reviewKycSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT'], {
    required_error: 'Hành động là bắt buộc (APPROVE hoặc REJECT)',
  }),
  rejectionReason: z.string().optional(),
});

export const getUsersQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
  role: userRoleSchema.optional(),
  status: userStatusSchema.optional(),
  authProvider: authProviderSchema.optional(),
  kycStatus: kycStatusSchema.optional(),
  isProfileCompleted: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  sortBy: sortBySchema.optional(),
  sortOrder: sortOrderSchema.optional(),
});

import { z } from 'zod';

const pointSchema = z.object({
  type: z.literal('Point'),
  coordinates: z
    .array(z.number())
    .length(2, 'coordinates phải có đúng 2 phần tử [lng, lat]'),
});

export const sendCreatePostPasscodeSchema = z.object({}).passthrough();

export const createPostSchema = z.object({
  type: z.enum(['P2P_FREE', 'B2C_MYSTERY_BAG'], {
    errorMap: () => ({ message: 'type phải là P2P_FREE hoặc B2C_MYSTERY_BAG' }),
  }),
  category: z.string().min(1, 'category là bắt buộc'),
  title: z.string().min(1, 'title là bắt buộc'),
  description: z.string().optional(),
  images: z.array(z.string().min(1)).min(1, 'Cần ít nhất 1 ảnh'),
  totalQuantity: z.number().positive('totalQuantity phải lớn hơn 0'),
  price: z.number().min(0).optional(),
  expiryDate: z.string().min(1, 'expiryDate là bắt buộc'),
  pickupTime: z.object({
    start: z.string().min(1, 'pickupTime.start là bắt buộc'),
    end: z.string().min(1, 'pickupTime.end là bắt buộc'),
  }),
  location: pointSchema.optional(),
  publishAt: z.string().optional(),
  passcode: z.string().regex(/^\d{6}$/, 'Passcode phải gồm đúng 6 chữ số'),
});

export type CreatePostBody = z.infer<typeof createPostSchema>;

// Các trường user được phép cập nhật (không cho đổi status, ownerId, ...)
export const updatePostSchema = z
  .object({
    category: z.string().min(1, 'category không được rỗng').optional(),
    title: z.string().min(1, 'title không được rỗng').optional(),
    description: z.string().optional(),
    images: z.array(z.string().min(1)).min(1, 'Cần ít nhất 1 ảnh').optional(),
    totalQuantity: z
      .number()
      .positive('totalQuantity phải lớn hơn 0')
      .optional(),
    remainingQuantity: z
      .number()
      .min(0, 'remainingQuantity không được âm')
      .optional(),
    price: z.number().min(0).optional(),
    expiryDate: z.string().min(1).optional(),
    pickupTime: z.object({
      start: z.string().min(1),
      end: z.string().min(1),
    }).optional(),
    location: pointSchema.optional(),
    publishAt: z.string().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Cần ít nhất 1 trường để cập nhật',
  });

export type UpdatePostBody = z.infer<typeof updatePostSchema>;

// Admin được phép sửa bất kỳ trường nào kể cả status
export const adminUpdatePostSchema = z
  .object({
    type: z
      .enum(['P2P_FREE', 'B2C_MYSTERY_BAG'], {
        errorMap: () => ({
          message: 'type phải là P2P_FREE hoặc B2C_MYSTERY_BAG',
        }),
      })
      .optional(),
    category: z.string().min(1).optional(),
    title: z.string().min(1).optional(),
    description: z.string().optional(),
    images: z.array(z.string().min(1)).min(1, 'Cần ít nhất 1 ảnh').optional(),
    totalQuantity: z.number().positive().optional(),
    remainingQuantity: z.number().min(0).optional(),
    price: z.number().min(0).optional(),
    expiryDate: z.string().min(1).optional(),
    pickupTime: z.object({
      start: z.string().min(1),
      end: z.string().min(1),
    }).optional(),
    location: pointSchema.optional(),
    publishAt: z.string().optional(),
    status: z
      .enum([
        'PENDING_REVIEW',
        'AVAILABLE',
        'BOOKED',
        'OUT_OF_STOCK',
        'HIDDEN',
        'REJECTED',
      ])
      .optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Cần ít nhất 1 trường để cập nhật',
  });

export type AdminUpdatePostBody = z.infer<typeof adminUpdatePostSchema>;

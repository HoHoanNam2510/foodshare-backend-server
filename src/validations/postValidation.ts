import { z } from 'zod';

const pointSchema = z.object({
  type: z.literal('Point'),
  coordinates: z
    .array(z.number())
    .length(2, 'coordinates phải có đúng 2 phần tử [lng, lat]'),
});

export const sendCreatePostPasscodeSchema = z.object({}).strict();

export const createPostSchema = z.object({
  type: z.string().min(1, 'type là bắt buộc'),
  category: z.string().min(1, 'category là bắt buộc'),
  title: z.string().min(1, 'title là bắt buộc'),
  description: z.string().optional(),
  images: z.array(z.string().min(1)).min(1, 'Cần ít nhất 1 ảnh'),
  totalQuantity: z.number().positive('totalQuantity phải lớn hơn 0'),
  price: z.number().min(0).optional(),
  expiryDate: z.string().min(1, 'expiryDate là bắt buộc'),
  pickupTime: z.string().min(1, 'pickupTime là bắt buộc'),
  location: pointSchema,
  publishAt: z.string().optional(),
  passcode: z.string().regex(/^\d{6}$/, 'Passcode phải gồm đúng 6 chữ số'),
});

export type CreatePostBody = z.infer<typeof createPostSchema>;

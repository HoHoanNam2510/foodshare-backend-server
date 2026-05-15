import { z } from 'zod';

export const createPostTemplateSchema = z
  .object({
    templateName: z.string().min(1, 'Tên mẫu là bắt buộc').trim(),
    type: z.enum(['P2P_FREE', 'B2C_MYSTERY_BAG'], {
      errorMap: () => ({
        message: 'type phải là P2P_FREE hoặc B2C_MYSTERY_BAG',
      }),
    }),
    category: z.string().min(1, 'category là bắt buộc'),
    title: z.string().min(1, 'title là bắt buộc').trim(),
    description: z.string().optional(),
    images: z.array(z.string().min(1)).optional().default([]),
    totalQuantity: z.number().positive('totalQuantity phải lớn hơn 0'),
    price: z.number().min(0).optional().default(0),
  })
  .refine(
    (data) => {
      if (data.type === 'P2P_FREE') return (data.price ?? 0) === 0;
      if (data.type === 'B2C_MYSTERY_BAG') return (data.price ?? 0) > 0;
      return true;
    },
    {
      message:
        'Giá không hợp lệ với loại bài đăng (P2P phải = 0, B2C phải > 0)',
    }
  );

export type CreatePostTemplateBody = z.infer<typeof createPostTemplateSchema>;

export const updatePostTemplateSchema = z
  .object({
    templateName: z
      .string()
      .min(1, 'Tên mẫu không được rỗng')
      .trim()
      .optional(),
    type: z
      .enum(['P2P_FREE', 'B2C_MYSTERY_BAG'], {
        errorMap: () => ({
          message: 'type phải là P2P_FREE hoặc B2C_MYSTERY_BAG',
        }),
      })
      .optional(),
    category: z.string().min(1, 'category không được rỗng').optional(),
    title: z.string().min(1, 'title không được rỗng').trim().optional(),
    description: z.string().optional(),
    images: z.array(z.string().min(1)).optional(),
    totalQuantity: z
      .number()
      .positive('totalQuantity phải lớn hơn 0')
      .optional(),
    price: z.number().min(0).optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Cần ít nhất 1 trường để cập nhật',
  });

export type UpdatePostTemplateBody = z.infer<typeof updatePostTemplateSchema>;

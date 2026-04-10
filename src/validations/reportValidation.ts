import { z } from 'zod';

// =============================================
// I. VALIDATION CHO USER / STORE
// =============================================

export const createReportSchema = z.object({
  targetType: z.enum(['POST', 'USER', 'TRANSACTION', 'REVIEW'], {
    errorMap: () => ({
      message: 'targetType phải là POST, USER, TRANSACTION hoặc REVIEW',
    }),
  }),
  targetId: z.string().min(1, 'targetId là bắt buộc'),
  reason: z.enum(
    ['FOOD_SAFETY', 'SCAM', 'INAPPROPRIATE_CONTENT', 'NO_SHOW', 'OTHER'],
    {
      errorMap: () => ({
        message:
          'reason phải là FOOD_SAFETY, SCAM, INAPPROPRIATE_CONTENT, NO_SHOW hoặc OTHER',
      }),
    }
  ),
  description: z.string().min(10, 'Mô tả tối thiểu 10 ký tự'),
  images: z.array(z.string().min(1)).min(1, 'Cần ít nhất 1 ảnh bằng chứng'),
});

export type CreateReportBody = z.infer<typeof createReportSchema>;

export const updateReportSchema = z.object({
  reason: z
    .enum(
      ['FOOD_SAFETY', 'SCAM', 'INAPPROPRIATE_CONTENT', 'NO_SHOW', 'OTHER'],
      {
        errorMap: () => ({
          message:
            'reason phải là FOOD_SAFETY, SCAM, INAPPROPRIATE_CONTENT, NO_SHOW hoặc OTHER',
        }),
      }
    )
    .optional(),
  description: z.string().min(10, 'Mô tả tối thiểu 10 ký tự').optional(),
  images: z
    .array(z.string().min(1))
    .min(1, 'Cần ít nhất 1 ảnh bằng chứng')
    .optional(),
});

export type UpdateReportBody = z.infer<typeof updateReportSchema>;

// =============================================
// II. VALIDATION CHO ADMIN
// =============================================

export const adminProcessReportSchema = z.object({
  status: z.enum(['RESOLVED', 'DISMISSED'], {
    errorMap: () => ({
      message: 'status phải là RESOLVED hoặc DISMISSED',
    }),
  }),
  actionTaken: z
    .enum(
      [
        'NONE',
        'POST_HIDDEN',
        'USER_WARNED',
        'USER_BANNED',
        'REFUNDED',
        'REVIEW_DELETED',
      ],
      {
        errorMap: () => ({
          message:
            'actionTaken phải là NONE, POST_HIDDEN, USER_WARNED, USER_BANNED, REFUNDED hoặc REVIEW_DELETED',
        }),
      }
    )
    .optional()
    .default('NONE'),
  resolutionNote: z.string().min(1, 'Lời nhắn phán quyết là bắt buộc'),
});

export type AdminProcessReportBody = z.infer<typeof adminProcessReportSchema>;

import { z } from 'zod';

// =============================================
// I. VALIDATION CHO USER / STORE
// =============================================

export const createReviewSchema = z.object({
  transactionId: z.string().min(1, 'transactionId là bắt buộc'),
  rating: z
    .number()
    .int('Rating phải là số nguyên')
    .min(1, 'Đánh giá tối thiểu là 1 sao')
    .max(5, 'Đánh giá tối đa là 5 sao'),
  feedback: z.string().optional(),
});

export type CreateReviewBody = z.infer<typeof createReviewSchema>;

export const updateReviewSchema = z.object({
  rating: z
    .number()
    .int('Rating phải là số nguyên')
    .min(1, 'Đánh giá tối thiểu là 1 sao')
    .max(5, 'Đánh giá tối đa là 5 sao'),
  feedback: z.string().optional(),
});

export type UpdateReviewBody = z.infer<typeof updateReviewSchema>;

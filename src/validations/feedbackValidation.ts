import { z } from 'zod';

export const createFeedbackSchema = z.object({
  type: z.enum(['BUG_REPORT', 'SUGGESTION'], {
    errorMap: () => ({ message: 'type phải là BUG_REPORT hoặc SUGGESTION' }),
  }),
  title: z
    .string()
    .min(5, 'Tiêu đề tối thiểu 5 ký tự')
    .max(100, 'Tiêu đề tối đa 100 ký tự'),
  content: z
    .string()
    .min(10, 'Nội dung tối thiểu 10 ký tự')
    .max(500, 'Nội dung tối đa 500 ký tự'),
  attachments: z
    .array(z.string().url('URL ảnh không hợp lệ'))
    .max(3, 'Tối đa 3 ảnh đính kèm')
    .optional()
    .default([]),
  contextMetadata: z
    .object({
      appVersion: z.string().optional(),
      os: z.enum(['ios', 'android', 'web']).optional(),
      relatedEntityId: z.string().optional(),
    })
    .optional()
    .default({}),
});

export type CreateFeedbackBody = z.infer<typeof createFeedbackSchema>;

export const adminResolveFeedbackSchema = z.object({
  adminReply: z.string().min(10, 'Phản hồi tối thiểu 10 ký tự'),
});

export type AdminResolveFeedbackBody = z.infer<
  typeof adminResolveFeedbackSchema
>;

export const getFeedbacksQuerySchema = z.object({
  status: z.enum(['PENDING', 'PROCESSING', 'CLOSED']).optional(),
  type: z.enum(['BUG_REPORT', 'SUGGESTION']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(50).default(20),
  search: z.string().optional(),
});

export type GetFeedbacksQuery = z.infer<typeof getFeedbacksQuerySchema>;

import { z } from 'zod';

// PUT /api/notifications/push-token — save Expo push token
export const savePushTokenSchema = z.object({
  token: z.string().min(1, 'Push token không được để trống'),
});

// DELETE /api/notifications/batch — delete multiple by IDs
export const batchDeleteSchema = z.object({
  ids: z
    .array(z.string().min(1))
    .min(1, 'Phải có ít nhất 1 ID')
    .max(100, 'Tối đa 100 thông báo mỗi lần xóa'),
});

// POST /api/notifications/admin/broadcast
export const adminBroadcastSchema = z.object({
  targetRole: z.enum(['USER', 'STORE', 'ALL', 'ADMIN'], {
    errorMap: () => ({
      message: "targetRole phải là 'USER', 'STORE', 'ALL' hoặc 'ADMIN'",
    }),
  }),
  title: z.string().min(1, 'Tiêu đề không được để trống'),
  body: z.string().min(1, 'Nội dung không được để trống'),
  type: z.string().min(1, 'Loại thông báo không được để trống'),
});

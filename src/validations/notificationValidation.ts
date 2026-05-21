import { z } from 'zod';

// PUT /api/notifications/push-token — save Expo push token
export const savePushTokenSchema = z.object({
  token: z.string().min(1, 'Push token không được để trống'),
});

// POST /api/notifications/admin/broadcast
export const adminBroadcastSchema = z.object({
  targetRole: z.enum(['USER', 'STORE', 'ALL'], {
    errorMap: () => ({
      message: "targetRole phải là 'USER', 'STORE' hoặc 'ALL'",
    }),
  }),
  title: z.string().min(1, 'Tiêu đề không được để trống'),
  body: z.string().min(1, 'Nội dung không được để trống'),
  type: z.string().min(1, 'Loại thông báo không được để trống'),
});

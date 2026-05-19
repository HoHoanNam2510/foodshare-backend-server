import { z } from 'zod';

// POST /api/badges/admin — create badge
export const createBadgeSchema = z.object({
  code: z.string().min(1, 'Mã huy hiệu là bắt buộc'),
  name: z.string().min(1, 'Tên huy hiệu là bắt buộc'),
  description: z.string().optional(),
  imageUrl: z.string().url('URL ảnh không hợp lệ'),
  targetRole: z.enum(['USER', 'STORE', 'ALL'], {
    errorMap: () => ({
      message: "targetRole phải là 'USER', 'STORE' hoặc 'ALL'",
    }),
  }),
  triggerEvent: z.string().min(1, 'triggerEvent là bắt buộc'),
  pointReward: z.number().int().min(0, 'Điểm thưởng phải >= 0'),
  sortOrder: z.number().int().min(0).optional(),
});

// PUT /api/badges/admin/:badgeId — update badge (all fields optional)
export const updateBadgeSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  imageUrl: z.string().url('URL ảnh không hợp lệ').optional(),
  pointReward: z.number().int().min(0).optional(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

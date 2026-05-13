import { z } from 'zod';

const hexColorRegex = /^#[0-9A-Fa-f]{6}$/;
const slugRegex = /^[a-z0-9-]+$/;

export const createCategorySchema = z.object({
  slug: z
    .string()
    .min(1, 'slug là bắt buộc')
    .regex(slugRegex, 'slug chỉ được chứa chữ thường, số và dấu gạch ngang'),
  name: z.string().min(1, 'name là bắt buộc').max(50, 'name tối đa 50 ký tự'),
  icon: z.string().optional().default(''),
  color: z
    .string()
    .regex(hexColorRegex, 'color phải là mã hex hợp lệ (VD: #2E7D32)'),
  applyTo: z.enum(['P2P_FREE', 'B2C_MYSTERY_BAG', 'BOTH'], {
    errorMap: () => ({
      message: 'applyTo phải là P2P_FREE, B2C_MYSTERY_BAG hoặc BOTH',
    }),
  }),
  sortOrder: z.number().min(0).optional(),
});

export type CreateCategoryBody = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = z
  .object({
    name: z.string().min(1).max(50).optional(),
    icon: z.string().min(1).optional(),
    color: z.string().regex(hexColorRegex).optional(),
    applyTo: z.enum(['P2P_FREE', 'B2C_MYSTERY_BAG', 'BOTH']).optional(),
    sortOrder: z.number().min(0).optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Cần ít nhất 1 trường để cập nhật',
  });

export type UpdateCategoryBody = z.infer<typeof updateCategorySchema>;

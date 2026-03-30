import { z } from 'zod';

// =============================================
// I. VALIDATION CHO STORE
// =============================================

export const createVoucherSchema = z.object({
  code: z
    .string()
    .min(3, 'Mã voucher tối thiểu 3 ký tự')
    .max(30, 'Mã voucher tối đa 30 ký tự'),
  title: z
    .string()
    .min(3, 'Tiêu đề tối thiểu 3 ký tự')
    .max(200, 'Tiêu đề tối đa 200 ký tự'),
  description: z.string().max(1000, 'Mô tả tối đa 1000 ký tự').optional(),
  discountType: z.enum(['PERCENTAGE', 'FIXED_AMOUNT'], {
    errorMap: () => ({
      message: 'discountType phải là PERCENTAGE hoặc FIXED_AMOUNT',
    }),
  }),
  discountValue: z.number().min(1, 'Giá trị giảm tối thiểu là 1'),
  pointCost: z.number().min(0, 'Số điểm cần để đổi không được âm'),
  totalQuantity: z
    .number()
    .int('Số lượng phải là số nguyên')
    .min(1, 'Số lượng tối thiểu là 1'),
  validFrom: z
    .string()
    .datetime('validFrom phải là chuỗi ngày hợp lệ (ISO 8601)'),
  validUntil: z
    .string()
    .datetime('validUntil phải là chuỗi ngày hợp lệ (ISO 8601)'),
});

export type CreateVoucherBody = z.infer<typeof createVoucherSchema>;

export const updateVoucherSchema = z.object({
  title: z
    .string()
    .min(3, 'Tiêu đề tối thiểu 3 ký tự')
    .max(200, 'Tiêu đề tối đa 200 ký tự')
    .optional(),
  description: z.string().max(1000, 'Mô tả tối đa 1000 ký tự').optional(),
  discountType: z
    .enum(['PERCENTAGE', 'FIXED_AMOUNT'], {
      errorMap: () => ({
        message: 'discountType phải là PERCENTAGE hoặc FIXED_AMOUNT',
      }),
    })
    .optional(),
  discountValue: z.number().min(1, 'Giá trị giảm tối thiểu là 1').optional(),
  pointCost: z.number().min(0, 'Số điểm cần để đổi không được âm').optional(),
  code: z
    .string()
    .min(3, 'Mã voucher tối thiểu 3 ký tự')
    .max(30, 'Mã voucher tối đa 30 ký tự')
    .optional(),
  totalQuantity: z
    .number()
    .int('Số lượng phải là số nguyên')
    .min(1, 'Số lượng tối thiểu là 1')
    .optional(),
  validUntil: z
    .string()
    .datetime('validUntil phải là chuỗi ngày hợp lệ (ISO 8601)')
    .optional(),
});

export type UpdateVoucherBody = z.infer<typeof updateVoucherSchema>;

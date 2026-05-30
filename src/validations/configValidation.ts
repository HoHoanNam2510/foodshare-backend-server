import { z } from 'zod';

const VALID_INTERVALS = [1, 2, 6, 12, 24] as const;

// PUT /api/config — update system bank account
export const updateSystemBankSchema = z.object({
  systemBankName: z.string().min(1, 'Tên ngân hàng là bắt buộc'),
  systemBankCode: z.string().min(1, 'Mã ngân hàng là bắt buộc'),
  systemBankAccountNumber: z.string().min(1, 'Số tài khoản là bắt buộc'),
  systemBankAccountName: z.string().min(1, 'Tên chủ tài khoản là bắt buộc'),
});

// PATCH /api/config/soft-delete — update soft delete config
export const updateSoftDeleteSchema = z.object({
  softDelete: z.object({
    gracePeriodDays: z.union([z.literal(7), z.literal(30)]),
    cleanupSchedule: z.enum(['WEEKLY', 'MONTHLY', 'BOTH']),
  }),
});

// PUT /api/config/ai-moderation — update AI moderation settings
export const updateAIModerationSchema = z.object({
  enabled: z.boolean({
    required_error: 'enabled là bắt buộc và phải là boolean',
  }),
  intervalHours: z
    .number()
    .refine(
      (v) => VALID_INTERVALS.includes(v as (typeof VALID_INTERVALS)[number]),
      {
        message: `intervalHours phải là một trong: ${VALID_INTERVALS.join(', ')}`,
      }
    ),
  trustScoreThresholds: z
    .object({
      reject: z.number().min(0).max(99),
      approve: z.number().min(1).max(100),
    })
    .refine((v) => v.reject < v.approve, {
      message: 'reject phải nhỏ hơn approve',
    }),
});

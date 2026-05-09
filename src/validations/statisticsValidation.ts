import { z } from 'zod';

export const statisticsQuerySchema = z
  .object({
    range: z.enum(['7d', '30d', '12m', 'custom'], {
      errorMap: () => ({ message: 'range must be 7d, 30d, 12m, or custom' }),
    }),
    from: z
      .string()
      .refine((val) => !val || !isNaN(Date.parse(val)), {
        message: 'from must be a valid ISO date string',
      })
      .optional(),
    to: z
      .string()
      .refine((val) => !val || !isNaN(Date.parse(val)), {
        message: 'to must be a valid ISO date string',
      })
      .optional(),
    compareFrom: z
      .string()
      .refine((val) => !val || !isNaN(Date.parse(val)), {
        message: 'compareFrom must be a valid ISO date string',
      })
      .optional(),
    compareTo: z
      .string()
      .refine((val) => !val || !isNaN(Date.parse(val)), {
        message: 'compareTo must be a valid ISO date string',
      })
      .optional(),
    postType: z
      .enum(['P2P_FREE', 'B2C_MYSTERY_BAG', 'ALL'], {
        errorMap: () => ({
          message: 'postType must be P2P_FREE, B2C_MYSTERY_BAG, or ALL',
        }),
      })
      .optional(),
  })
  .refine((data) => data.range !== 'custom' || (data.from && data.to), {
    message: 'from and to are required for custom range',
    path: ['from', 'to'],
  })
  .refine(
    (data) =>
      !data.from || !data.to || new Date(data.from) <= new Date(data.to),
    { message: 'from must be before or equal to to', path: ['from'] }
  )
  .refine(
    (data) => {
      if (data.range === 'custom' && data.from && data.to) {
        const start = new Date(data.from);
        const end = new Date(data.to);
        const diffInMonths =
          (end.getFullYear() - start.getFullYear()) * 12 +
          (end.getMonth() - start.getMonth());
        return diffInMonths <= 24;
      }
      return true;
    },
    { message: 'Custom range cannot exceed 24 months', path: ['from', 'to'] }
  )
  .refine(
    (data) =>
      !(data.compareFrom && !data.compareTo) &&
      !(!data.compareFrom && data.compareTo),
    {
      message: 'compareFrom and compareTo must both be provided or both absent',
      path: ['compareFrom', 'compareTo'],
    }
  )
  .refine(
    (data) =>
      !data.compareFrom ||
      !data.compareTo ||
      new Date(data.compareFrom) <= new Date(data.compareTo),
    {
      message: 'compareFrom must be before or equal to compareTo',
      path: ['compareFrom'],
    }
  )
  .refine(
    (data) => {
      if (data.compareFrom && data.compareTo) {
        const start = new Date(data.compareFrom);
        const end = new Date(data.compareTo);
        const diffInMonths =
          (end.getFullYear() - start.getFullYear()) * 12 +
          (end.getMonth() - start.getMonth());
        return diffInMonths <= 24;
      }
      return true;
    },
    {
      message: 'Compare range cannot exceed 24 months',
      path: ['compareFrom', 'compareTo'],
    }
  );

export type StatisticsQuery = z.infer<typeof statisticsQuerySchema>;

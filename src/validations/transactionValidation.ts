import { z } from 'zod';

const mongoIdSchema = z
  .string()
  .regex(
    /^[a-f\d]{24}$/i,
    'ID không hợp lệ — phải là MongoDB ObjectId 24 ký tự'
  );

// POST /api/transactions/requests — createRequest (P2P)
// POST /api/transactions/orders  — createOrder (B2C)
export const createTransactionSchema = z.object({
  postId: mongoIdSchema,
  quantity: z
    .number({ required_error: 'Số lượng là bắt buộc' })
    .int()
    .min(1, 'Số lượng phải ít nhất là 1'),
  userVoucherId: mongoIdSchema.optional(),
});

// PUT /api/transactions/requests/:id — updateOrDeleteRequest
export const updateOrCancelRequestSchema = z.object({
  action: z.enum(['UPDATE', 'DELETE'], {
    errorMap: () => ({ message: "action phải là 'UPDATE' hoặc 'DELETE'" }),
  }),
  quantity: z.number().int().min(1, 'Số lượng phải ít nhất là 1').optional(),
});

// PATCH /api/transactions/:id/respond — respondToRequest (P2P & B2C)
export const respondToRequestSchema = z.object({
  response: z.enum(['ACCEPT', 'REJECT'], {
    errorMap: () => ({ message: "response phải là 'ACCEPT' hoặc 'REJECT'" }),
  }),
});

// POST /api/transactions/scan — scanQrAndComplete
export const scanQrSchema = z.object({
  qrCode: z.string().min(1, 'Mã QR không được để trống'),
});

// PATCH /api/transactions/admin/:id/status — adminForceUpdateStatus
export const adminForceStatusSchema = z.object({
  status: z.enum(
    ['PENDING', 'ACCEPTED', 'REJECTED', 'COMPLETED', 'CANCELLED'],
    {
      errorMap: () => ({
        message:
          'Trạng thái không hợp lệ. Cho phép: PENDING, ACCEPTED, REJECTED, COMPLETED, CANCELLED',
      }),
    }
  ),
});

// Shared param schema for routes with :id
export const transactionIdParamSchema = z.object({
  id: mongoIdSchema,
});

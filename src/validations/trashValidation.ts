import { z } from 'zod';

const mongoIdSchema = z
  .string()
  .regex(/^[a-f\d]{24}$/i, 'ID không hợp lệ — phải là MongoDB ObjectId 24 ký tự');

export const VALID_COLLECTIONS = [
  'users',
  'posts',
  'reviews',
  'vouchers',
  'reports',
  'conversations',
  'messages',
] as const;

export const trashCollectionParamSchema = z.object({
  collection: z.enum(VALID_COLLECTIONS, {
    errorMap: () => ({
      message: `collection phải là một trong: ${VALID_COLLECTIONS.join(', ')}`,
    }),
  }),
  id: mongoIdSchema,
});

export const trashIdParamSchema = z.object({
  id: mongoIdSchema,
});

export const restoreUserBodySchema = z.object({
  restoreAssociated: z.boolean().optional().default(false),
});

// User-facing trash (chỉ cho phép posts | reviews | vouchers)
export const USER_TRASH_COLLECTIONS = ['posts', 'reviews', 'vouchers'] as const;

export const userTrashCollectionParamSchema = z.object({
  collection: z.enum(USER_TRASH_COLLECTIONS, {
    errorMap: () => ({
      message: `collection phải là một trong: ${USER_TRASH_COLLECTIONS.join(', ')}`,
    }),
  }),
  id: mongoIdSchema,
});

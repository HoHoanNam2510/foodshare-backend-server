import { z } from 'zod';

const ALLOWED_FOLDERS = ['avatars', 'posts', 'kyc', 'reports', 'chat'] as const;

export const uploadQuerySchema = z.object({
  folder: z.enum(ALLOWED_FOLDERS).optional().default('posts'),
});

export const deleteSingleImageSchema = z.object({
  url: z
    .string({ required_error: 'Thiếu URL ảnh cần xóa' })
    .url('URL không hợp lệ'),
});

export const deleteMultipleImagesSchema = z.object({
  urls: z
    .array(z.string().url('URL không hợp lệ'))
    .min(1, 'Cần ít nhất 1 URL')
    .max(20, 'Tối đa 20 URL mỗi lần xóa'),
});

export type DeleteSingleImageBody = z.infer<typeof deleteSingleImageSchema>;
export type DeleteMultipleImagesBody = z.infer<
  typeof deleteMultipleImagesSchema
>;

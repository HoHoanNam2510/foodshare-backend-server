import { z } from 'zod';

const MAX_BATCH_SIZE = 100;
const MAX_TEXT_LENGTH = 2000;

// POST /api/translate
export const translateBatchSchema = z.object({
  texts: z
    .array(
      z
        .string()
        .max(MAX_TEXT_LENGTH, `Mỗi text tối đa ${MAX_TEXT_LENGTH} ký tự`)
    )
    .min(1, 'Cần ít nhất 1 text')
    .max(MAX_BATCH_SIZE, `Tối đa ${MAX_BATCH_SIZE} text mỗi request`),
  targetLang: z.enum(['vi', 'en'], {
    errorMap: () => ({ message: "targetLang phải là 'vi' hoặc 'en'" }),
  }),
});

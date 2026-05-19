import { Router, Request, Response } from 'express';
import { verifyAuth } from '@/middlewares/authMiddleware';
import { validateBody } from '@/middlewares/validateBodyMiddleware';
import { translateBatchSchema } from '@/validations/translateValidation';
import { translateBatch, SupportedLang } from '@/services/translateService';
import logger from '@/utils/logger';

const router = Router();

/**
 * POST /api/translate
 * Body: { texts: string[], targetLang: 'vi' | 'en' }
 * Returns: { success, data: { translations: string[] } }
 */
router.post(
  '/',
  verifyAuth,
  validateBody(translateBatchSchema),
  async (req: Request, res: Response) => {
    try {
      const { texts, targetLang } = req.body as {
        texts: string[];
        targetLang: SupportedLang;
      };

      const translations = await translateBatch(texts, targetLang);

      res.status(200).json({
        success: true,
        data: { translations },
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Lỗi không xác định';
      logger.error(`POST /api/translate — ${message}`);
      res.status(500).json({ success: false, message });
    }
  }
);

export default router;

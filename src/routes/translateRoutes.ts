import { Router, Request, Response } from 'express';
import { verifyAuth } from '@/middlewares/authMiddleware';
import { translateBatch, SupportedLang } from '@/services/translateService';
import logger from '@/utils/logger';

const router = Router();

const MAX_BATCH_SIZE = 100;
const MAX_TEXT_LENGTH = 2000;

/**
 * POST /api/translate
 * Body: { texts: string[], targetLang: 'vi' | 'en' }
 * Returns: { success, data: { translations: string[] } }
 */
router.post('/', verifyAuth, async (req: Request, res: Response) => {
  try {
    const { texts, targetLang } = req.body as {
      texts?: unknown;
      targetLang?: unknown;
    };

    if (!Array.isArray(texts) || texts.some((t) => typeof t !== 'string')) {
      res.status(400).json({
        success: false,
        message: 'texts phải là mảng chuỗi',
      });
      return;
    }
    if (texts.length > MAX_BATCH_SIZE) {
      res.status(400).json({
        success: false,
        message: `Tối đa ${MAX_BATCH_SIZE} text mỗi request`,
      });
      return;
    }
    if (texts.some((t) => (t as string).length > MAX_TEXT_LENGTH)) {
      res.status(400).json({
        success: false,
        message: `Mỗi text tối đa ${MAX_TEXT_LENGTH} ký tự`,
      });
      return;
    }
    if (targetLang !== 'vi' && targetLang !== 'en') {
      res.status(400).json({
        success: false,
        message: "targetLang phải là 'vi' hoặc 'en'",
      });
      return;
    }

    const translations = await translateBatch(
      texts as string[],
      targetLang as SupportedLang
    );

    res.status(200).json({
      success: true,
      data: { translations },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Lỗi không xác định';
    logger.error(`POST /api/translate — ${message}`);
    res.status(500).json({ success: false, message });
  }
});

export default router;

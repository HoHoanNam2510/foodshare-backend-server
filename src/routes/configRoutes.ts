import { Router, Request, Response } from 'express';
import { verifyAuth, verifyAdmin } from '@/middlewares/authMiddleware';
import { validateBody } from '@/middlewares/validateBodyMiddleware';
import {
  updateSystemBankSchema,
  updateAIModerationSchema,
} from '@/validations/configValidation';
import SystemConfig from '@/models/SystemConfig';
import AIPostModerationLog from '@/models/AIPostModerationLog';
import { runAIBatchModerationJob } from '@/services/postService';

const router = Router();

router.use(verifyAuth, verifyAdmin);

/**
 * GET /api/config
 * Lấy cấu hình hệ thống
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const config = await SystemConfig.findOne().lean();
    res.status(200).json({ success: true, data: config ?? null });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Lỗi không xác định';
    res.status(500).json({ success: false, message });
  }
});

/**
 * PUT /api/config
 * Tạo hoặc cập nhật cấu hình tài khoản ngân hàng hệ thống (upsert singleton)
 */
router.put(
  '/',
  validateBody(updateSystemBankSchema),
  async (req: Request, res: Response) => {
    try {
      const {
        systemBankName,
        systemBankCode,
        systemBankAccountNumber,
        systemBankAccountName,
      } = req.body;

      const config = await SystemConfig.findOneAndUpdate(
        {},
        {
          systemBankName,
          systemBankCode,
          systemBankAccountNumber,
          systemBankAccountName,
        },
        { upsert: true, new: true, runValidators: true }
      );

      res.status(200).json({ success: true, data: config });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Lỗi không xác định';
      res.status(500).json({ success: false, message });
    }
  }
);

/**
 * PUT /api/config/ai-moderation
 * Cập nhật cài đặt AI kiểm duyệt bài đăng
 */
router.put(
  '/ai-moderation',
  validateBody(updateAIModerationSchema),
  async (req: Request, res: Response) => {
    try {
      const { enabled, intervalHours, trustScoreThresholds } = req.body;

      const config = await SystemConfig.findOneAndUpdate(
        {},
        {
          'aiModeration.enabled': enabled,
          'aiModeration.intervalHours': intervalHours,
          'aiModeration.trustScoreThresholds.reject':
            trustScoreThresholds.reject,
          'aiModeration.trustScoreThresholds.approve':
            trustScoreThresholds.approve,
        },
        { upsert: true, new: true, runValidators: true }
      );

      res.status(200).json({ success: true, data: config });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Lỗi không xác định';
      res.status(500).json({ success: false, message });
    }
  }
);

/**
 * POST /api/config/ai-moderation/run
 * Trigger AI batch moderation thủ công
 */
router.post('/ai-moderation/run', async (_req: Request, res: Response) => {
  try {
    const stats = await runAIBatchModerationJob('MANUAL_ADMIN');
    res.status(200).json({ success: true, data: stats });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Lỗi không xác định';
    res.status(500).json({ success: false, message });
  }
});

/**
 * GET /api/config/ai-moderation/logs
 * Lấy lịch sử quyết định AI (paginated)
 */
router.get('/ai-moderation/logs', async (req: Request, res: Response) => {
  try {
    const page = Math.max(parseInt(req.query.page as string) || 1, 1);
    const limit = Math.min(
      Math.max(parseInt(req.query.limit as string) || 20, 1),
      50
    );
    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      AIPostModerationLog.find()
        .populate('postId', 'title')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      AIPostModerationLog.countDocuments(),
    ]);

    res.status(200).json({
      success: true,
      data: logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Lỗi không xác định';
    res.status(500).json({ success: false, message });
  }
});

export default router;

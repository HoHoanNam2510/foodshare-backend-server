import { Router, Request, Response } from 'express';
import { verifyAuth, verifyAdmin } from '@/middlewares/authMiddleware';
import SystemConfig from '@/models/SystemConfig';
import AIPostModerationLog from '@/models/AIPostModerationLog';
import { runAIBatchModerationJob } from '@/services/postService';

const router = Router();

router.use(verifyAuth, verifyAdmin);

const VALID_INTERVALS = [1, 2, 6, 12, 24];

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
router.put('/', async (req: Request, res: Response) => {
  try {
    const {
      systemBankName,
      systemBankCode,
      systemBankAccountNumber,
      systemBankAccountName,
    } = req.body;

    if (
      !systemBankName ||
      !systemBankCode ||
      !systemBankAccountNumber ||
      !systemBankAccountName
    ) {
      res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp đầy đủ thông tin ngân hàng hệ thống',
      });
      return;
    }

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
});

/**
 * PUT /api/config/ai-moderation
 * Cập nhật cài đặt AI kiểm duyệt bài đăng
 */
router.put('/ai-moderation', async (req: Request, res: Response) => {
  try {
    const { enabled, intervalHours, trustScoreThresholds } = req.body;

    if (typeof enabled !== 'boolean') {
      res
        .status(400)
        .json({ success: false, message: 'enabled phải là boolean' });
      return;
    }

    if (!VALID_INTERVALS.includes(Number(intervalHours))) {
      res.status(400).json({
        success: false,
        message: `intervalHours phải là một trong: ${VALID_INTERVALS.join(', ')}`,
      });
      return;
    }

    const reject = Number(trustScoreThresholds?.reject);
    const approve = Number(trustScoreThresholds?.approve);

    if (
      isNaN(reject) ||
      isNaN(approve) ||
      reject < 0 ||
      approve > 100 ||
      reject >= approve
    ) {
      res.status(400).json({
        success: false,
        message:
          'trustScoreThresholds không hợp lệ: cần 0 ≤ reject < approve ≤ 100',
      });
      return;
    }

    const config = await SystemConfig.findOneAndUpdate(
      {},
      {
        'aiModeration.enabled': enabled,
        'aiModeration.intervalHours': intervalHours,
        'aiModeration.trustScoreThresholds.reject': reject,
        'aiModeration.trustScoreThresholds.approve': approve,
      },
      { upsert: true, new: true, runValidators: true }
    );

    res.status(200).json({ success: true, data: config });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Lỗi không xác định';
    res.status(500).json({ success: false, message });
  }
});

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

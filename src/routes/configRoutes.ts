import { Router, Request, Response } from 'express';
import { verifyAuth, verifyAdmin } from '@/middlewares/authMiddleware';
import SystemConfig from '@/models/SystemConfig';

const router = Router();

router.use(verifyAuth, verifyAdmin);

/**
 * GET /api/config
 * Lấy cấu hình tài khoản ngân hàng hệ thống
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const config = await SystemConfig.findOne().lean();
    res.status(200).json({ success: true, data: config ?? null });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Lỗi không xác định';
    res.status(500).json({ success: false, message });
  }
});

/**
 * PUT /api/config
 * Tạo hoặc cập nhật cấu hình tài khoản ngân hàng hệ thống (upsert singleton)
 */
router.put('/', async (req: Request, res: Response) => {
  try {
    const { systemBankName, systemBankCode, systemBankAccountNumber, systemBankAccountName } =
      req.body;

    if (!systemBankName || !systemBankCode || !systemBankAccountNumber || !systemBankAccountName) {
      res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp đầy đủ thông tin ngân hàng hệ thống',
      });
      return;
    }

    const config = await SystemConfig.findOneAndUpdate(
      {},
      { systemBankName, systemBankCode, systemBankAccountNumber, systemBankAccountName },
      { upsert: true, new: true, runValidators: true }
    );

    res.status(200).json({ success: true, data: config });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Lỗi không xác định';
    res.status(500).json({ success: false, message });
  }
});

export default router;

import { Request, Response } from 'express';

import {
  GreenPointServiceError,
  getPointHistory as getPointHistoryService,
} from '@/services/greenPointService';

function handleGreenPointError(error: unknown, res: Response): void {
  if (error instanceof GreenPointServiceError) {
    res.status(error.statusCode).json({
      success: false,
      message: error.message,
    });
    return;
  }

  const message =
    error instanceof Error ? error.message : 'Lỗi không xác định';
  console.error('❌ GreenPoint Error:', message);
  res.status(500).json({
    success: false,
    message: 'Đã xảy ra lỗi từ phía server',
  });
}

// =============================================
// I. NHÓM HANDLER DÀNH CHO USER
// =============================================

/**
 * [GET] /api/greenpoints/history
 * RWD_F01: Xem biến động số dư Green Points của tài khoản.
 */
export const getPointHistory = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Bạn cần đăng nhập để thực hiện thao tác này',
      });
      return;
    }

    const page = req.query.page ? Number(req.query.page) : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;

    const result = await getPointHistoryService(userId, { page, limit });

    res.status(200).json({
      success: true,
      data: {
        greenPoints: result.greenPoints,
        logs: result.logs,
      },
      pagination: result.pagination,
    });
  } catch (error) {
    handleGreenPointError(error, res);
  }
};

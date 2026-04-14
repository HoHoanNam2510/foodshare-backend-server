import { Request, Response } from 'express';

import {
  GreenPointServiceError,
  getPointHistory as getPointHistoryService,
  adminGetAllPointLogs as adminGetAllPointLogsService,
  getLeaderboard as getLeaderboardService,
  getMyRankingSummary as getMyRankingSummaryService,
  LeaderboardPeriod,
  LeaderboardRole,
} from '@/services/greenPointService';

function handleGreenPointError(error: unknown, res: Response): void {
  if (error instanceof GreenPointServiceError) {
    res.status(error.statusCode).json({
      success: false,
      message: error.message,
    });
    return;
  }

  const message = error instanceof Error ? error.message : 'Lỗi không xác định';
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

// =============================================
// II. NHÓM HANDLER RANKING (PUBLIC/USER)
// =============================================

/**
 * [GET] /api/greenpoints/leaderboard
 * RWD_F02: Xem bảng xếp hạng theo kỳ (daily/weekly/monthly/yearly).
 * Public endpoint: không bắt buộc đăng nhập.
 */
export const getLeaderboard = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const period =
      (req.query.period as LeaderboardPeriod | undefined) || 'weekly';
    const role = (req.query.role as LeaderboardRole | undefined) || 'ALL';
    const limit = req.query.limit ? Number(req.query.limit) : undefined;

    const validPeriods: LeaderboardPeriod[] = [
      'daily',
      'weekly',
      'monthly',
      'yearly',
    ];
    const validRoles: LeaderboardRole[] = ['USER', 'STORE', 'ALL'];

    if (!validPeriods.includes(period)) {
      res.status(400).json({
        success: false,
        message: 'period phải là daily | weekly | monthly | yearly',
      });
      return;
    }

    if (!validRoles.includes(role)) {
      res.status(400).json({
        success: false,
        message: 'role phải là USER | STORE | ALL',
      });
      return;
    }

    const result = await getLeaderboardService({
      period,
      role,
      limit,
      currentUserId: req.user?.id,
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    handleGreenPointError(error, res);
  }
};

/**
 * [GET] /api/greenpoints/ranking-summary
 * RWD_F03: Tóm tắt thứ hạng của bản thân trong 4 kỳ.
 */
export const getMyRankingSummary = async (
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

    const result = await getMyRankingSummaryService(userId);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    handleGreenPointError(error, res);
  }
};

// =============================================
// III. NHÓM HANDLER DÀNH CHO ADMIN
// =============================================

/**
 * [GET] /api/greenpoints/admin/logs
 * Admin xem toàn bộ lịch sử biến động Green Points, có thể lọc theo userId.
 */
export const adminGetAllPointLogs = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { userId, page, limit } = req.query;

    const result = await adminGetAllPointLogsService({
      userId: userId as string | undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });

    res.status(200).json({
      success: true,
      data: result.logs,
      pagination: result.pagination,
    });
  } catch (error) {
    handleGreenPointError(error, res);
  }
};

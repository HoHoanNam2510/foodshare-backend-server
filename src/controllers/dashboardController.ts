import { Request, Response } from 'express';
import {
  getOverviewStats,
  getGrowthChart,
  getRecentUsers,
  getRecentPosts,
  getRecentTransactions,
  getRecentReports,
  getAuditLogs,
  TimeRange,
  SortOrder,
} from '@/services/dashboardService';

// GET /api/dashboard/stats — tổng quan thống kê
export const dashboardStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const stats = await getOverviewStats();
    res.json({ success: true, data: stats });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/dashboard/chart?tab=users&range=week&date=2026-04-01 — dữ liệu biểu đồ tăng trưởng
export const dashboardChart = async (req: Request, res: Response): Promise<void> => {
  try {
    const tab = (req.query.tab as string) || 'users';
    const range = (req.query.range as TimeRange) || 'week';
    const dateStr = req.query.date as string | undefined;

    const validTabs = ['users', 'posts', 'transactions', 'reports', 'audits'];
    const validRanges: TimeRange[] = ['day', 'week', 'month'];

    if (!validTabs.includes(tab)) {
      res.status(400).json({ success: false, message: `Tab không hợp lệ. Chấp nhận: ${validTabs.join(', ')}` });
      return;
    }
    if (!validRanges.includes(range)) {
      res.status(400).json({ success: false, message: `Range không hợp lệ. Chấp nhận: ${validRanges.join(', ')}` });
      return;
    }

    // Parse optional anchor date
    let anchor: Date | undefined;
    if (dateStr) {
      const parsed = new Date(dateStr);
      if (!isNaN(parsed.getTime())) {
        anchor = parsed;
      }
    }

    const data = await getGrowthChart(tab, range, anchor);
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/dashboard/table?tab=users&page=1&limit=10&sortOrder=desc — dữ liệu bảng
export const dashboardTable = async (req: Request, res: Response): Promise<void> => {
  try {
    const tab = (req.query.tab as string) || 'users';
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 10));
    const sortOrder: SortOrder = req.query.sortOrder === 'asc' ? 'asc' : 'desc';

    const tableFns: Record<string, (p: number, l: number, s: SortOrder) => Promise<any>> = {
      users: getRecentUsers,
      posts: getRecentPosts,
      transactions: getRecentTransactions,
      reports: getRecentReports,
      audits: getAuditLogs,
    };

    const fn = tableFns[tab];
    if (!fn) {
      res.status(400).json({ success: false, message: `Tab không hợp lệ: ${tab}` });
      return;
    }

    const result = await fn(page, limit, sortOrder);
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

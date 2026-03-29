import { Request, Response } from 'express';

import {
  ReportServiceError,
  createReport as createReportService,
  getMyReports as getMyReportsService,
  adminGetReports as adminGetReportsService,
  adminGetReportDetail as adminGetReportDetailService,
  adminProcessReport as adminProcessReportService,
} from '@/services/reportService';
import { ReportStatus, ReportTargetType, ReportReason } from '@/models/Report';

function handleReportError(error: unknown, res: Response): void {
  if (error instanceof ReportServiceError) {
    res.status(error.statusCode).json({
      success: false,
      message: error.message,
    });
    return;
  }

  const message = error instanceof Error ? error.message : 'Lỗi không xác định';
  console.error('❌ Report Error:', message);
  res.status(500).json({
    success: false,
    message: 'Đã xảy ra lỗi từ phía server',
  });
}

// =============================================
// I. NHÓM HANDLER DÀNH CHO USER / STORE
// =============================================

/**
 * [POST] /api/reports
 * Gửi báo cáo vi phạm về Post / User / Transaction.
 */
export const createReport = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const reporterId = req.user?.id;
    if (!reporterId) {
      res.status(401).json({
        success: false,
        message: 'Bạn cần đăng nhập để thực hiện thao tác này',
      });
      return;
    }

    const { targetType, targetId, reason, description, images } = req.body;

    const report = await createReportService(reporterId, {
      targetType,
      targetId,
      reason,
      description,
      images,
    });

    res.status(201).json({
      success: true,
      message: 'Gửi báo cáo vi phạm thành công',
      data: report,
    });
  } catch (error) {
    handleReportError(error, res);
  }
};

/**
 * [GET] /api/reports/me
 * Xem lịch sử khiếu nại cá nhân (các báo cáo user đã gửi).
 */
export const getMyReports = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const reporterId = req.user?.id;
    if (!reporterId) {
      res.status(401).json({
        success: false,
        message: 'Bạn cần đăng nhập để thực hiện thao tác này',
      });
      return;
    }

    const statusFilter = req.query.status as ReportStatus | undefined;

    const reports = await getMyReportsService(reporterId, statusFilter);

    res.status(200).json({
      success: true,
      data: reports,
    });
  } catch (error) {
    handleReportError(error, res);
  }
};

// =============================================
// II. NHÓM HANDLER DÀNH CHO ADMIN
// =============================================

/**
 * [GET] /api/reports/admin
 * Danh sách báo cáo toàn hệ thống, hỗ trợ lọc & phân trang.
 */
export const adminGetReports = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { status, targetType, reason, page, limit } = req.query;

    const result = await adminGetReportsService({
      status: status as ReportStatus | undefined,
      targetType: targetType as ReportTargetType | undefined,
      reason: reason as ReportReason | undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });

    res.status(200).json({
      success: true,
      data: result.data,
      pagination: result.pagination,
    });
  } catch (error) {
    handleReportError(error, res);
  }
};

/**
 * [GET] /api/reports/admin/:id
 * Xem chi tiết bằng chứng 1 report cụ thể.
 */
export const adminGetReportDetail = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const reportId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : req.params.id;

    const report = await adminGetReportDetailService(reportId);

    res.status(200).json({
      success: true,
      data: report,
    });
  } catch (error) {
    handleReportError(error, res);
  }
};

/**
 * [PUT] /api/reports/admin/:id/process
 * Admin phán xử & thực thi hình phạt.
 */
export const adminProcessReport = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const adminId = req.user?.id;
    if (!adminId) {
      res.status(401).json({
        success: false,
        message: 'Bạn cần đăng nhập để thực hiện thao tác này',
      });
      return;
    }

    const reportId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : req.params.id;

    const { status, actionTaken, resolutionNote } = req.body;

    const report = await adminProcessReportService(reportId, adminId, {
      status,
      actionTaken,
      resolutionNote,
    });

    res.status(200).json({
      success: true,
      message: 'Phán quyết đã được thực thi thành công',
      data: report,
    });
  } catch (error) {
    handleReportError(error, res);
  }
};

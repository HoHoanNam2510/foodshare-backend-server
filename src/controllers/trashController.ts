import { Request, Response } from 'express';
import mongoose from 'mongoose';

import {
  SoftDeleteError,
  TrashCollection,
  softDeleteUser,
  softDeletePost,
  softDeleteReview,
  softDeleteVoucher,
  softDeleteReport,
  restoreItem,
  purgeItem,
  purgeAllNow,
  restoreUserWithAssociated,
  getTrashItems,
  runCleanup,
} from '@/services/softDeleteService';
import SystemConfig from '@/models/SystemConfig';

function handleTrashError(error: unknown, res: Response): void {
  if (error instanceof SoftDeleteError) {
    res
      .status(error.statusCode)
      .json({ success: false, message: error.message });
    return;
  }

  const message = error instanceof Error ? error.message : 'Lỗi không xác định';
  console.error('❌ Trash Error:', message);
  res
    .status(500)
    .json({ success: false, message: 'Đã xảy ra lỗi từ phía server' });
}

// =============================================
// ADMIN SOFT DELETE OVERRIDES
// =============================================

/**
 * [DELETE] /api/admin/trash/users/:id
 * Admin soft delete user (cascade).
 */
export const adminSoftDeleteUser = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const adminId = req.user?.id;

    if (!adminId) {
      res.status(401).json({ success: false, message: 'Bạn cần đăng nhập' });
      return;
    }

    if (id === adminId) {
      res.status(400).json({
        success: false,
        message: 'Không thể tự xóa tài khoản admin của mình qua tính năng này',
      });
      return;
    }

    await softDeleteUser(id, adminId);

    res.status(200).json({
      success: true,
      message: 'Đã chuyển tài khoản vào thùng rác thành công',
    });
  } catch (error) {
    handleTrashError(error, res);
  }
};

/**
 * [DELETE] /api/admin/trash/posts/:id
 * Admin soft delete post.
 */
export const adminSoftDeletePost = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const adminId = req.user?.id;

    if (!adminId) {
      res.status(401).json({ success: false, message: 'Bạn cần đăng nhập' });
      return;
    }

    await softDeletePost(id, adminId);

    res.status(200).json({
      success: true,
      message: 'Đã chuyển bài đăng vào thùng rác',
    });
  } catch (error) {
    handleTrashError(error, res);
  }
};

/**
 * [DELETE] /api/admin/trash/reviews/:id
 * Admin soft delete review.
 */
export const adminSoftDeleteReview = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const adminId = req.user?.id;

    if (!adminId) {
      res.status(401).json({ success: false, message: 'Bạn cần đăng nhập' });
      return;
    }

    await softDeleteReview(id, adminId);

    res.status(200).json({
      success: true,
      message: 'Đã chuyển đánh giá vào thùng rác',
    });
  } catch (error) {
    handleTrashError(error, res);
  }
};

/**
 * [DELETE] /api/admin/trash/vouchers/:id
 * Admin soft delete voucher.
 */
export const adminSoftDeleteVoucher = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const adminId = req.user?.id;

    if (!adminId) {
      res.status(401).json({ success: false, message: 'Bạn cần đăng nhập' });
      return;
    }

    await softDeleteVoucher(id, adminId);

    res.status(200).json({
      success: true,
      message: 'Đã chuyển voucher vào thùng rác',
    });
  } catch (error) {
    handleTrashError(error, res);
  }
};

// =============================================
// THÙNG RÁC — Xem / Restore / Purge
// =============================================

/**
 * [GET] /api/admin/trash
 * Xem danh sách dữ liệu trong thùng rác.
 * Query: ?collection=users&page=1&limit=20&from=ISO_DATE&to=ISO_DATE
 */
export const getTrash = async (req: Request, res: Response): Promise<void> => {
  try {
    const { collection, page, limit, from, to } = req.query;

    const results = await getTrashItems({
      collection: collection as TrashCollection | undefined,
      page: page ? Number(page) : 1,
      limit: limit ? Math.min(Number(limit), 100) : 20,
      from: from ? new Date(from as string) : undefined,
      to: to ? new Date(to as string) : undefined,
    });

    // Nếu query 1 collection cụ thể → trả về flat result
    if (collection && results.length === 1) {
      const result = results[0];
      res.status(200).json({
        success: true,
        collection: result.collection,
        data: result.data,
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: result.totalPages,
        },
      });
      return;
    }

    res.status(200).json({ success: true, data: results });
  } catch (error) {
    handleTrashError(error, res);
  }
};

/**
 * [POST] /api/admin/trash/restore/:collection/:id
 * Restore 1 item từ thùng rác.
 */
export const restoreFromTrash = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const collection = Array.isArray(req.params.collection) ? req.params.collection[0] : req.params.collection;
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, message: 'ID không hợp lệ' });
      return;
    }

    const restored = await restoreItem(collection, id);

    res.status(200).json({
      success: true,
      message: `Đã khôi phục dữ liệu thành công`,
      data: restored,
    });
  } catch (error) {
    handleTrashError(error, res);
  }
};

/**
 * [DELETE] /api/admin/trash/purge/:collection/:id
 * Xóa vĩnh viễn 1 item khỏi thùng rác.
 */
export const purgeFromTrash = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const collection = Array.isArray(req.params.collection) ? req.params.collection[0] : req.params.collection;
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, message: 'ID không hợp lệ' });
      return;
    }

    await purgeItem(collection, id);

    res.status(200).json({
      success: true,
      message: 'Đã xóa vĩnh viễn dữ liệu thành công',
    });
  } catch (error) {
    handleTrashError(error, res);
  }
};

/**
 * [DELETE] /api/admin/trash/reports/:id
 * Admin soft delete report.
 */
export const adminSoftDeleteReport = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const adminId = req.user?.id;

    if (!adminId) {
      res.status(401).json({ success: false, message: 'Bạn cần đăng nhập' });
      return;
    }

    await softDeleteReport(id, adminId);

    res.status(200).json({
      success: true,
      message: 'Đã chuyển báo cáo vào thùng rác',
    });
  } catch (error) {
    handleTrashError(error, res);
  }
};

/**
 * [DELETE] /api/admin/trash/purge-all
 * Admin xóa vĩnh viễn toàn bộ dữ liệu đã xóa mềm, bỏ qua grace period.
 */
export const purgeAll = async (_req: Request, res: Response): Promise<void> => {
  try {
    const results = await purgeAllNow();
    const totalPurged = results.reduce((sum, r) => sum + r.purgedCount, 0);

    res.status(200).json({
      success: true,
      message: `Đã xóa vĩnh viễn ${totalPurged} bản ghi khỏi tất cả collections`,
      data: results,
    });
  } catch (error) {
    handleTrashError(error, res);
  }
};

/**
 * [POST] /api/admin/trash/restore-user/:id
 * Restore user và (tuỳ chọn) cascade restore các dữ liệu liên quan.
 */
export const restoreUser = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const restoreAssociated = req.body?.restoreAssociated === true;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, message: 'ID không hợp lệ' });
      return;
    }

    await restoreUserWithAssociated(id, restoreAssociated);

    res.status(200).json({
      success: true,
      message: restoreAssociated
        ? 'Đã khôi phục tài khoản và toàn bộ dữ liệu liên quan'
        : 'Đã khôi phục tài khoản thành công',
    });
  } catch (error) {
    handleTrashError(error, res);
  }
};

/**
 * [POST] /api/admin/trash/cleanup-now
 * Admin kích hoạt dọn dẹp thùng rác ngay lập tức.
 */
export const cleanupNow = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const config = await SystemConfig.findOne();
    const gracePeriodDays = config?.softDelete?.gracePeriodDays ?? 30;

    const results = await runCleanup(gracePeriodDays);
    const totalPurged = results.reduce((sum, r) => sum + r.purgedCount, 0);

    res.status(200).json({
      success: true,
      message: `Dọn dẹp hoàn tất — đã xóa vĩnh viễn ${totalPurged} bản ghi`,
      data: results,
    });
  } catch (error) {
    handleTrashError(error, res);
  }
};

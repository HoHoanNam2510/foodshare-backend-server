import { Request, Response } from 'express';
import mongoose from 'mongoose';

import {
  getBadgeCatalog,
  getMyBadges,
  adminGetAllBadges,
  adminCreateBadge,
  adminUpdateBadge,
  adminToggleBadge,
  adminGetBadgeStats,
} from '@/services/badgeService';

function handleBadgeError(error: unknown, res: Response): void {
  const err = error as Error & { statusCode?: number };
  const statusCode = err.statusCode || 500;
  const message =
    statusCode === 500 ? 'Đã xảy ra lỗi từ phía server' : err.message;

  if (statusCode === 500) {
    console.error('❌ Badge Error:', err.message);
  }

  res.status(statusCode).json({ success: false, message });
}

// =============================================
// I. NHÓM HANDLER DÀNH CHO USER
// =============================================

/**
 * [GET] /api/badges/catalog
 * BDG_U01: Xem toàn bộ catalog + trạng thái mở khóa cá nhân.
 */
export const getBadgeCatalogHandler = async (
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

    const data = await getBadgeCatalog(userId);
    res.status(200).json({ success: true, data });
  } catch (error) {
    handleBadgeError(error, res);
  }
};

/**
 * [GET] /api/badges/my
 * BDG_U02: Xem danh sách huy hiệu đã mở khóa.
 */
export const getMyBadgesHandler = async (
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

    const badges = await getMyBadges(userId);
    res.status(200).json({ success: true, data: badges });
  } catch (error) {
    handleBadgeError(error, res);
  }
};

// =============================================
// II. NHÓM HANDLER DÀNH CHO ADMIN
// =============================================

/**
 * [GET] /api/badges/admin
 * BDG_A01: Admin xem catalog + thống kê unlock.
 */
export const adminGetAllBadgesHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { targetRole, isActive, page, limit } = req.query;

    const result = await adminGetAllBadges({
      targetRole: typeof targetRole === 'string' ? targetRole : undefined,
      isActive:
        isActive === 'true' ? true : isActive === 'false' ? false : undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });

    res.status(200).json({ success: true, data: result });
  } catch (error) {
    handleBadgeError(error, res);
  }
};

/**
 * [POST] /api/badges/admin
 * BDG_A02: Admin tạo huy hiệu mới.
 */
export const adminCreateBadgeHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const {
      code,
      name,
      description,
      imageUrl,
      targetRole,
      triggerEvent,
      pointReward,
      sortOrder,
    } = req.body;

    if (
      !code ||
      !name ||
      !description ||
      !imageUrl ||
      !targetRole ||
      !triggerEvent ||
      pointReward === undefined
    ) {
      res.status(400).json({
        success: false,
        message: 'Vui lòng điền đầy đủ các trường bắt buộc',
      });
      return;
    }

    const badge = await adminCreateBadge({
      code,
      name,
      description,
      imageUrl,
      targetRole,
      triggerEvent,
      pointReward: Number(pointReward),
      sortOrder: sortOrder ? Number(sortOrder) : undefined,
    });

    res.status(201).json({
      success: true,
      message: 'Tạo huy hiệu thành công',
      data: badge,
    });
  } catch (error) {
    handleBadgeError(error, res);
  }
};

/**
 * [PUT] /api/badges/admin/:badgeId
 * BDG_A03: Admin cập nhật huy hiệu.
 */
export const adminUpdateBadgeHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const badgeId = String(req.params.badgeId || '');

    if (!mongoose.Types.ObjectId.isValid(badgeId)) {
      res
        .status(400)
        .json({ success: false, message: 'Badge ID không hợp lệ' });
      return;
    }

    const { name, description, imageUrl, pointReward, sortOrder, isActive } =
      req.body;

    const badge = await adminUpdateBadge(badgeId, {
      name,
      description,
      imageUrl,
      pointReward: pointReward !== undefined ? Number(pointReward) : undefined,
      sortOrder: sortOrder !== undefined ? Number(sortOrder) : undefined,
      isActive,
    });

    res.status(200).json({
      success: true,
      message: 'Cập nhật huy hiệu thành công',
      data: badge,
    });
  } catch (error) {
    handleBadgeError(error, res);
  }
};

/**
 * [PATCH] /api/badges/admin/:badgeId/toggle
 * BDG_A04: Admin bật/tắt huy hiệu.
 */
export const adminToggleBadgeHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const badgeId = String(req.params.badgeId || '');

    if (!mongoose.Types.ObjectId.isValid(badgeId)) {
      res
        .status(400)
        .json({ success: false, message: 'Badge ID không hợp lệ' });
      return;
    }

    const result = await adminToggleBadge(badgeId);
    const message = result.isActive ? 'Đã bật huy hiệu' : 'Đã tắt huy hiệu';

    res.status(200).json({ success: true, message, data: result });
  } catch (error) {
    handleBadgeError(error, res);
  }
};

/**
 * [GET] /api/badges/admin/stats
 * BDG_A05: Thống kê huy hiệu phổ biến nhất.
 */
export const adminGetBadgeStatsHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const stats = await adminGetBadgeStats();
    res.status(200).json({ success: true, data: stats });
  } catch (error) {
    handleBadgeError(error, res);
  }
};

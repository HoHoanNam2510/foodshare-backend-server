import { Request, Response } from 'express';
import mongoose from 'mongoose';

import {
  getActiveCategories,
  adminGetAllCategories,
  adminCreateCategory,
  adminUpdateCategory,
  adminDeleteCategory,
} from '@/services/categoryService';
import logger from '@/utils/logger';

function handleCategoryError(error: unknown, res: Response): void {
  const err = error as Error & { statusCode?: number };
  const statusCode = err.statusCode || 500;
  const message =
    statusCode === 500 ? 'Đã xảy ra lỗi từ phía server' : err.message;

  if (statusCode === 500) {
    logger.error('❌ Category Error:', err.message);
  }

  res.status(statusCode).json({ success: false, message });
}

// =============================================
// I. NHÓM HANDLER DÀNH CHO PUBLIC
// =============================================

/**
 * [GET] /api/categories
 * CAT_P01: Lấy danh sách category active cho FilterPills.
 * Query: applyTo? = 'P2P_FREE' | 'B2C_MYSTERY_BAG'
 */
export const getActiveCategoriesHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const applyTo =
      typeof req.query.applyTo === 'string' ? req.query.applyTo : undefined;

    const categories = await getActiveCategories(applyTo);
    res.status(200).json({ success: true, data: categories });
  } catch (error) {
    handleCategoryError(error, res);
  }
};

// =============================================
// II. NHÓM HANDLER DÀNH CHO ADMIN
// =============================================

/**
 * [GET] /api/categories/admin
 * CAT_A01: Admin xem toàn bộ danh sách category.
 */
export const adminGetAllCategoriesHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { isActive, applyTo, page, limit } = req.query;

    const result = await adminGetAllCategories({
      isActive:
        isActive === 'true' ? true : isActive === 'false' ? false : undefined,
      applyTo: typeof applyTo === 'string' ? applyTo : undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });

    res.status(200).json({ success: true, data: result });
  } catch (error) {
    handleCategoryError(error, res);
  }
};

/**
 * [POST] /api/categories/admin
 * CAT_A02: Admin tạo category mới.
 */
export const adminCreateCategoryHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { slug, name, icon, color, applyTo, sortOrder } = req.body;

    const category = await adminCreateCategory({
      slug,
      name,
      icon,
      color,
      applyTo,
      sortOrder: sortOrder !== undefined ? Number(sortOrder) : undefined,
    });

    res.status(201).json({
      success: true,
      message: 'Tạo category thành công',
      data: category,
    });
  } catch (error) {
    handleCategoryError(error, res);
  }
};

/**
 * [PUT] /api/categories/admin/:categoryId
 * CAT_A03: Admin cập nhật category.
 */
export const adminUpdateCategoryHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const categoryId = String(req.params.categoryId || '');

    if (!mongoose.Types.ObjectId.isValid(categoryId)) {
      res
        .status(400)
        .json({ success: false, message: 'Category ID không hợp lệ' });
      return;
    }

    const { name, icon, color, applyTo, sortOrder, isActive } = req.body;

    const category = await adminUpdateCategory(categoryId, {
      name,
      icon,
      color,
      applyTo,
      sortOrder: sortOrder !== undefined ? Number(sortOrder) : undefined,
      isActive,
    });

    res.status(200).json({
      success: true,
      message: 'Cập nhật category thành công',
      data: category,
    });
  } catch (error) {
    handleCategoryError(error, res);
  }
};

/**
 * [DELETE] /api/categories/admin/:categoryId
 * CAT_A04: Admin xóa mềm category (isActive = false).
 */
export const adminDeleteCategoryHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const categoryId = String(req.params.categoryId || '');

    if (!mongoose.Types.ObjectId.isValid(categoryId)) {
      res
        .status(400)
        .json({ success: false, message: 'Category ID không hợp lệ' });
      return;
    }

    await adminDeleteCategory(categoryId);
    res.status(200).json({ success: true, message: 'Đã xóa category' });
  } catch (error) {
    handleCategoryError(error, res);
  }
};

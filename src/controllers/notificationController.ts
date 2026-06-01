import { Request, Response } from 'express';
import mongoose from 'mongoose';
import {
  getUserNotifications,
  getUserUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
  deleteUserNotification,
  deleteAllReadNotifications,
  deleteManyUserNotifications,
  saveUserPushToken,
  broadcastNotification,
  getBroadcastHistory,
} from '@/services/notificationService';
import logger from '@/utils/logger';

const DEFAULT_LIMIT = 20;

export const getMyNotifications = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user?.id as string;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(
      50,
      Math.max(1, Number(req.query.limit) || DEFAULT_LIMIT)
    );

    const result = await getUserNotifications(userId, page, limit);
    res.status(200).json({ success: true, ...result });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Lỗi không xác định';
    res
      .status(500)
      .json({ success: false, message: 'Lỗi server', error: message });
  }
};

export const getUnreadCount = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user?.id as string;
    const count = await getUserUnreadCount(userId);
    res.status(200).json({ success: true, data: { count } });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Lỗi không xác định';
    res
      .status(500)
      .json({ success: false, message: 'Lỗi server', error: message });
  }
};

export const markAsRead = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user?.id as string;
    const id = String(req.params.id);

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res
        .status(400)
        .json({ success: false, message: 'ID thông báo không hợp lệ' });
      return;
    }

    const notification = await markNotificationRead(userId, id);
    if (!notification) {
      res
        .status(404)
        .json({ success: false, message: 'Không tìm thấy thông báo' });
      return;
    }

    res.status(200).json({ success: true, data: notification });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Lỗi không xác định';
    res
      .status(500)
      .json({ success: false, message: 'Lỗi server', error: message });
  }
};

export const markAllAsRead = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user?.id as string;
    await markAllNotificationsRead(userId);
    res
      .status(200)
      .json({ success: true, message: 'Đã đánh dấu tất cả là đã đọc' });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Lỗi không xác định';
    res
      .status(500)
      .json({ success: false, message: 'Lỗi server', error: message });
  }
};

export const deleteNotification = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user?.id as string;
    const id = String(req.params.id);

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res
        .status(400)
        .json({ success: false, message: 'ID thông báo không hợp lệ' });
      return;
    }

    const notification = await deleteUserNotification(userId, id);
    if (!notification) {
      res
        .status(404)
        .json({ success: false, message: 'Không tìm thấy thông báo' });
      return;
    }

    res.status(200).json({ success: true, message: 'Đã xóa thông báo' });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Lỗi không xác định';
    res
      .status(500)
      .json({ success: false, message: 'Lỗi server', error: message });
  }
};

export const deleteAllRead = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user?.id as string;
    const deletedCount = await deleteAllReadNotifications(userId);
    res.status(200).json({
      success: true,
      message: `Đã xóa ${deletedCount} thông báo đã đọc`,
      data: { deletedCount },
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Lỗi không xác định';
    res
      .status(500)
      .json({ success: false, message: 'Lỗi server', error: message });
  }
};

export const deleteMany = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user?.id as string;
    const { ids } = req.body as { ids: string[] };

    const invalidIds = ids.filter((id) => !mongoose.Types.ObjectId.isValid(id));
    if (invalidIds.length > 0) {
      res.status(400).json({
        success: false,
        message: 'Danh sách chứa ID thông báo không hợp lệ',
      });
      return;
    }

    const deletedCount = await deleteManyUserNotifications(userId, ids);
    res.status(200).json({
      success: true,
      message: `Đã xóa ${deletedCount} thông báo`,
      data: { deletedCount },
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Lỗi không xác định';
    res
      .status(500)
      .json({ success: false, message: 'Lỗi server', error: message });
  }
};

export const savePushToken = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user?.id as string;
    const { token } = req.body as { token?: string };

    if (!token || typeof token !== 'string') {
      res
        .status(400)
        .json({ success: false, message: 'Push token không hợp lệ' });
      return;
    }

    await saveUserPushToken(userId, token);
    res.status(200).json({ success: true, message: 'Đã lưu push token' });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Lỗi không xác định';
    res
      .status(500)
      .json({ success: false, message: 'Lỗi server', error: message });
  }
};

export const adminBroadcastNotification = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const adminId = req.user?.id as string;
    const { targetRole, title, body, type } = req.body;

    if (!targetRole || !title || !body || !type) {
      res.status(400).json({
        success: false,
        message: 'Vui lòng điền đầy đủ thông tin bắt buộc',
      });
      return;
    }

    const validTargetRoles = ['ALL', 'USER', 'STORE', 'ADMIN'];
    const validTypes = ['TRANSACTION', 'RADAR', 'SYSTEM', 'VOUCHER'];

    if (!validTargetRoles.includes(targetRole)) {
      res
        .status(400)
        .json({ success: false, message: 'Đối tượng gửi không hợp lệ' });
      return;
    }

    if (!validTypes.includes(type)) {
      res
        .status(400)
        .json({ success: false, message: 'Loại thông báo không hợp lệ' });
      return;
    }

    const broadcast = await broadcastNotification(
      adminId,
      targetRole,
      title,
      body,
      type
    );

    res.status(201).json({
      success: true,
      message: 'Gửi broadcast thông báo thành công',
      data: broadcast,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Lỗi không xác định';
    logger.error('[Admin Broadcast] Error:', message);
    res
      .status(500)
      .json({ success: false, message: 'Lỗi server', error: message });
  }
};

export const adminGetBroadcastHistory = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));

    const result = await getBroadcastHistory(page, limit);

    res.status(200).json({
      success: true,
      data: result.data,
      pagination: result.pagination,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Lỗi không xác định';
    logger.error('[Admin Broadcast History] Error:', message);
    res
      .status(500)
      .json({ success: false, message: 'Lỗi server', error: message });
  }
};

import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Notification from '@/models/Notification';
import User from '@/models/User';

const DEFAULT_LIMIT = 20;

export const getMyNotifications = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(
      50,
      Math.max(1, Number(req.query.limit) || DEFAULT_LIMIT)
    );
    const skip = (page - 1) * limit;

    const [notifications, total] = await Promise.all([
      Notification.find({ userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Notification.countDocuments({ userId }),
    ]);

    res.status(200).json({
      success: true,
      data: notifications,
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
    const userId = req.user?.id;
    const count = await Notification.countDocuments({ userId, isRead: false });
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
    const userId = req.user?.id;
    const id = String(req.params.id);

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res
        .status(400)
        .json({ success: false, message: 'ID thông báo không hợp lệ' });
      return;
    }

    const notification = await Notification.findOneAndUpdate(
      { _id: id, userId },
      { isRead: true },
      { new: true }
    );

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
    const userId = req.user?.id;
    await Notification.updateMany({ userId, isRead: false }, { isRead: true });
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
    const userId = req.user?.id;
    const id = String(req.params.id);

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res
        .status(400)
        .json({ success: false, message: 'ID thông báo không hợp lệ' });
      return;
    }

    const notification = await Notification.findOneAndDelete({
      _id: id,
      userId,
    });

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

export const savePushToken = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { token } = req.body as { token?: string };

    if (!token || typeof token !== 'string') {
      res
        .status(400)
        .json({ success: false, message: 'Push token không hợp lệ' });
      return;
    }

    await User.findByIdAndUpdate(userId, { expoPushToken: token });

    res.status(200).json({ success: true, message: 'Đã lưu push token' });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Lỗi không xác định';
    res
      .status(500)
      .json({ success: false, message: 'Lỗi server', error: message });
  }
};

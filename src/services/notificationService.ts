import { Server } from 'socket.io';
import mongoose from 'mongoose';
import Expo, { ExpoPushMessage } from 'expo-server-sdk';

import Notification from '@/models/Notification';
import User from '@/models/User';
import NotificationBroadcast, {
  INotificationBroadcast,
} from '@/models/NotificationBroadcast';
import logger from '@/utils/logger';

type NotificationType = 'TRANSACTION' | 'RADAR' | 'SYSTEM' | 'VOUCHER';
type BroadcastTargetRole = 'ALL' | 'USER' | 'STORE' | 'ADMIN';

let io: Server | null = null;
const expo = new Expo();

export function initNotificationService(socketServer: Server): void {
  io = socketServer;
}

export async function createNotification(
  userId: string,
  type: NotificationType,
  title: string,
  body: string,
  referenceId?: string | mongoose.Types.ObjectId
): Promise<void> {
  try {
    const notification = await Notification.create({
      userId: new mongoose.Types.ObjectId(userId),
      type,
      title,
      body,
      ...(referenceId && {
        referenceId: new mongoose.Types.ObjectId(referenceId.toString()),
      }),
    });

    // Socket.io — real-time khi user đang online
    if (io) {
      io.to(`user:${userId}`).emit('new-notification', notification);
    }

    // Expo Push — background push khi user offline
    const user = await User.findById(userId).select('expoPushToken').lean();
    if (user?.expoPushToken && Expo.isExpoPushToken(user.expoPushToken)) {
      const message: ExpoPushMessage = {
        to: user.expoPushToken,
        title,
        body,
        data: {
          type,
          referenceId: referenceId?.toString(),
          notificationId: notification._id.toString(),
        },
        sound: 'default',
        channelId: 'default',
      };

      const chunks = expo.chunkPushNotifications([message]);
      for (const chunk of chunks) {
        try {
          await expo.sendPushNotificationsAsync(chunk);
        } catch (pushError) {
          logger.error('[NotificationService] Push send failed:', pushError);
        }
      }
    }
  } catch (error) {
    logger.error('[NotificationService] createNotification failed:', error);
  }
}

export async function broadcastNotification(
  adminId: string,
  targetRole: BroadcastTargetRole,
  title: string,
  body: string,
  type: NotificationType
): Promise<INotificationBroadcast> {
  try {
    // 1. Fetch target users (fixed: removed invalid FilterQuery type)
    const userQuery: Record<string, unknown> = {};
    if (targetRole !== 'ALL') {
      userQuery.role = targetRole;
    }

    const users = await User.find(userQuery).select('_id expoPushToken').lean();

    const recipientCount = users.length;

    // 2. Bulk create Notification records
    if (recipientCount > 0) {
      const notifications = users.map((user) => ({
        userId: user._id,
        type,
        title,
        body,
      }));
      await Notification.insertMany(notifications, { ordered: false });
    }

    // 3. Send Expo push notifications in bulk
    const validPushTokens = users
      .map((user) => user.expoPushToken)
      .filter(
        (token): token is string => !!token && Expo.isExpoPushToken(token)
      );

    if (validPushTokens.length > 0) {
      const messages: ExpoPushMessage[] = validPushTokens.map((token) => ({
        to: token,
        title,
        body,
        data: { type, isBroadcast: true },
        sound: 'default',
        channelId: 'default',
      }));

      const chunks = expo.chunkPushNotifications(messages);
      for (const chunk of chunks) {
        try {
          await expo.sendPushNotificationsAsync(chunk);
        } catch (pushError) {
          logger.error('[Broadcast] Push send failed:', pushError);
        }
      }
    }

    // 4. Create NotificationBroadcast record
    const broadcast = await NotificationBroadcast.create({
      adminId: new mongoose.Types.ObjectId(adminId),
      title,
      body,
      type,
      targetRole,
      recipientCount,
      sentAt: new Date(),
    });

    return broadcast;
  } catch (error) {
    logger.error('[NotificationService] broadcastNotification failed:', error);
    throw error;
  }
}

// =============================================
// USER-FACING NOTIFICATION CRUD
// =============================================

export interface NotificationPage {
  data: unknown[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export async function getUserNotifications(
  userId: string,
  page: number,
  limit: number
): Promise<NotificationPage> {
  const skip = (page - 1) * limit;
  const [notifications, total] = await Promise.all([
    Notification.find({ userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Notification.countDocuments({ userId }),
  ]);
  return {
    data: notifications,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function getUserUnreadCount(userId: string): Promise<number> {
  return Notification.countDocuments({ userId, isRead: false });
}

export async function markNotificationRead(
  userId: string,
  id: string
): Promise<unknown | null> {
  return Notification.findOneAndUpdate(
    { _id: id, userId },
    { isRead: true },
    { new: true }
  );
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  await Notification.updateMany({ userId, isRead: false }, { isRead: true });
}

export async function deleteUserNotification(
  userId: string,
  id: string
): Promise<unknown | null> {
  return Notification.findOneAndDelete({ _id: id, userId });
}

export async function saveUserPushToken(
  userId: string,
  token: string
): Promise<void> {
  await User.findByIdAndUpdate(userId, { expoPushToken: token });
}

export async function getBroadcastHistory(
  page: number = 1,
  limit: number = 20
): Promise<{
  data: INotificationBroadcast[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}> {
  try {
    const skip = (page - 1) * limit;

    const [broadcasts, total] = await Promise.all([
      NotificationBroadcast.find()
        .sort({ sentAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('adminId', 'fullName email')
        .lean(),
      NotificationBroadcast.countDocuments(),
    ]);

    return {
      data: broadcasts,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  } catch (error) {
    logger.error('[NotificationService] getBroadcastHistory failed:', error);
    throw error;
  }
}

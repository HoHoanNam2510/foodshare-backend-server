import { Server } from 'socket.io';
import mongoose from 'mongoose';
import Expo, { ExpoPushMessage } from 'expo-server-sdk';

import Notification from '@/models/Notification';
import User from '@/models/User';

type NotificationType = 'TRANSACTION' | 'RADAR' | 'SYSTEM' | 'VOUCHER';

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
          console.error('[NotificationService] Push send failed:', pushError);
        }
      }
    }
  } catch (error) {
    console.error('[NotificationService] createNotification failed:', error);
  }
}

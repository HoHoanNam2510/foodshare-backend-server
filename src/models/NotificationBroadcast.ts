import mongoose, { Schema, Document, Model } from 'mongoose';

export type BroadcastTargetRole = 'ALL' | 'USER' | 'STORE' | 'ADMIN';
export type NotificationType = 'TRANSACTION' | 'RADAR' | 'SYSTEM' | 'VOUCHER';

export interface INotificationBroadcast extends Document {
  adminId: mongoose.Types.ObjectId;
  title: string;
  body: string;
  type: NotificationType;
  targetRole: BroadcastTargetRole;
  recipientCount: number;
  sentAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationBroadcastSchema = new Schema<INotificationBroadcast>(
  {
    adminId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    body: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ['TRANSACTION', 'RADAR', 'SYSTEM', 'VOUCHER'],
      required: true,
    },
    targetRole: {
      type: String,
      enum: ['ALL', 'USER', 'STORE', 'ADMIN'],
      required: true,
    },
    recipientCount: {
      type: Number,
      default: 0,
    },
    sentAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// Indexes for history pagination and admin filtering
NotificationBroadcastSchema.index({ sentAt: -1 });
NotificationBroadcastSchema.index({ adminId: 1 });

const NotificationBroadcast: Model<INotificationBroadcast> =
  mongoose.models.NotificationBroadcast ||
  mongoose.model<INotificationBroadcast>(
    'NotificationBroadcast',
    NotificationBroadcastSchema
  );

export default NotificationBroadcast;

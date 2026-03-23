import mongoose, { Schema, Document, Model } from 'mongoose';

export interface INotification extends Document {
  userId: mongoose.Types.ObjectId;
  type: 'TRANSACTION' | 'RADAR' | 'SYSTEM' | 'VOUCHER';
  title: string;
  body: string;
  referenceId?: mongoose.Types.ObjectId;
  isRead: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    type: {
      type: String,
      enum: ['TRANSACTION', 'RADAR', 'SYSTEM', 'VOUCHER'],
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
    referenceId: {
      type: Schema.Types.ObjectId,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// Đánh Index tối ưu:
// 1. Lấy danh sách thông báo của user
NotificationSchema.index({ userId: 1, createdAt: -1 });

// 2. Lấy đếm nhanh (count) số lượng thông báo chưa đọc của user để hiện số badge đỏ trên icon chuông
NotificationSchema.index({ userId: 1, isRead: 1 });

const Notification: Model<INotification> =
  mongoose.models.Notification ||
  mongoose.model<INotification>('Notification', NotificationSchema);

export default Notification;

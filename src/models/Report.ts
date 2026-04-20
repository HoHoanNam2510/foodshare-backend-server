import mongoose, { Schema, Document, Model } from 'mongoose';
import { ISoftDelete, softDeletePlugin } from '@/plugins/softDeletePlugin';

export type ReportTargetType = 'POST' | 'USER' | 'TRANSACTION' | 'REVIEW';
export type ReportReason =
  | 'FOOD_SAFETY'
  | 'SCAM'
  | 'INAPPROPRIATE_CONTENT'
  | 'NO_SHOW'
  | 'OTHER';
export type ReportStatus = 'PENDING' | 'RESOLVED' | 'DISMISSED' | 'WITHDRAWN';
export type ReportAction =
  | 'NONE'
  | 'POST_HIDDEN'
  | 'USER_WARNED'
  | 'USER_BANNED'
  | 'REFUNDED'
  | 'REVIEW_DELETED';

export interface IReport extends Document, ISoftDelete {
  reporterId: mongoose.Types.ObjectId;
  targetType: ReportTargetType;
  targetId: mongoose.Types.ObjectId;
  reason: ReportReason;
  description: string;
  images: string[];
  status: ReportStatus;
  actionTaken: ReportAction;
  resolutionNote?: string;
  resolvedBy?: mongoose.Types.ObjectId;
  resolvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ReportSchema = new Schema<IReport>(
  {
    reporterId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    targetType: {
      type: String,
      enum: ['POST', 'USER', 'TRANSACTION', 'REVIEW'],
      required: true,
    },
    targetId: {
      type: Schema.Types.ObjectId,
      required: true,
      // Không dùng refPath vì populate thủ công theo targetType trong service
    },
    reason: {
      type: String,
      enum: [
        'FOOD_SAFETY',
        'SCAM',
        'INAPPROPRIATE_CONTENT',
        'NO_SHOW',
        'OTHER',
      ],
      required: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    images: [
      {
        type: String,
        required: true, // Bắt buộc có ảnh bằng chứng để tránh report láo
      },
    ],
    status: {
      type: String,
      enum: ['PENDING', 'RESOLVED', 'DISMISSED', 'WITHDRAWN'],
      default: 'PENDING',
    },
    actionTaken: {
      type: String,
      enum: [
        'NONE',
        'POST_HIDDEN',
        'USER_WARNED',
        'USER_BANNED',
        'REFUNDED',
        'REVIEW_DELETED',
      ],
      default: 'NONE',
    },
    resolutionNote: {
      type: String,
      trim: true,
    },
    resolvedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    resolvedAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

ReportSchema.plugin(softDeletePlugin);

// Đánh Index để tối ưu hiển thị cho Admin Dashboard:
// 1. Lọc danh sách Report theo trạng thái (VD: Admin muốn xem các đơn đang PENDING)
ReportSchema.index({ status: 1, createdAt: -1 });

// 2. Tìm nhanh các report nhắm vào một target cụ thể (để xem tiểu sử vi phạm)
ReportSchema.index({ targetType: 1, targetId: 1 });

// 3. Tìm nhanh các report của một user cụ thể
ReportSchema.index({ reporterId: 1, createdAt: -1 });

const Report: Model<IReport> =
  mongoose.models.Report || mongoose.model<IReport>('Report', ReportSchema);

export default Report;

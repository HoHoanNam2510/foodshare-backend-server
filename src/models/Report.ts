import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IReport extends Document {
  reporterId: mongoose.Types.ObjectId;
  reportedUserId: mongoose.Types.ObjectId;
  reason: string;
  evidenceImages: string[];
  status: 'TODO' | 'IN_PROGRESS' | 'COMPLETED' | 'REJECTED';
  adminResolution?: string;
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
    reportedUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    reason: {
      type: String,
      required: true,
      trim: true,
    },
    evidenceImages: [
      {
        type: String,
        required: true, // Nên bắt buộc có ảnh bằng chứng để tránh report láo
      },
    ],
    status: {
      type: String,
      enum: ['TODO', 'IN_PROGRESS', 'COMPLETED', 'REJECTED'],
      default: 'TODO',
    },
    adminResolution: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

// Đánh Index để tối ưu hiển thị cho Admin Dashboard:
// 1. Lọc danh sách Report theo trạng thái (VD: Admin muốn xem các đơn đang TODO)
ReportSchema.index({ status: 1, createdAt: -1 });

// 2. Tìm nhanh các report nhắm vào một User cụ thể (để xem tiểu sử vi phạm)
ReportSchema.index({ reportedUserId: 1 });

const Report: Model<IReport> =
  mongoose.models.Report || mongoose.model<IReport>('Report', ReportSchema);

export default Report;

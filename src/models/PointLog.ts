import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IPointLog extends Document {
  userId: mongoose.Types.ObjectId;
  amount: number;
  reason: string;
  referenceId?: mongoose.Types.ObjectId; // Trỏ tới Transaction, Report hoặc null
  createdAt: Date;
}

const PointLogSchema = new Schema<IPointLog>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      // Không để min/max vì có thể cộng điểm (số dương) hoặc trừ điểm phạt (số âm)
    },
    reason: {
      type: String,
      required: true,
      trim: true,
    },
    referenceId: {
      type: Schema.Types.ObjectId,
      // Cố tình không để ref cố định vì nó có thể trỏ tới Transaction hoặc Report tùy ngữ cảnh
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Đánh Index để lấy lịch sử điểm của 1 user nhanh chóng, sắp xếp từ mới nhất tới cũ nhất
PointLogSchema.index({ userId: 1, createdAt: -1 });

const PointLog: Model<IPointLog> =
  mongoose.models.PointLog ||
  mongoose.model<IPointLog>('PointLog', PointLogSchema);

export default PointLog;

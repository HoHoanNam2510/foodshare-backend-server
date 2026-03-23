import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IReview extends Document {
  transactionId: mongoose.Types.ObjectId;
  reviewerId: mongoose.Types.ObjectId;
  revieweeId: mongoose.Types.ObjectId;
  rating: number;
  feedback?: string;
  createdAt: Date;
}

const ReviewSchema = new Schema<IReview>(
  {
    transactionId: {
      type: Schema.Types.ObjectId,
      ref: 'Transaction',
      required: true,
    },
    reviewerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    revieweeId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    rating: {
      type: Number,
      required: true,
      min: [1, 'Đánh giá tối thiểu là 1 sao'],
      max: [5, 'Đánh giá tối đa là 5 sao'],
    },
    feedback: {
      type: String,
      trim: true,
      default: '',
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Đánh Index để tối ưu và bảo vệ dữ liệu:
// 1. Chống Spam: Mỗi người chỉ được đánh giá 1 lần cho 1 giao dịch
ReviewSchema.index({ transactionId: 1, reviewerId: 1 }, { unique: true });

// 2. Tối ưu truy vấn: Lấy danh sách đánh giá của một User/Store cụ thể để hiển thị trên Profile
ReviewSchema.index({ revieweeId: 1, createdAt: -1 });

const Review: Model<IReview> =
  mongoose.models.Review || mongoose.model<IReview>('Review', ReviewSchema);

export default Review;

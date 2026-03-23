import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IUserVoucher extends Document {
  userId: mongoose.Types.ObjectId;
  voucherId: mongoose.Types.ObjectId;
  status: 'UNUSED' | 'USED' | 'EXPIRED';
  usedAt?: Date;
  transactionId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const UserVoucherSchema = new Schema<IUserVoucher>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    voucherId: {
      type: Schema.Types.ObjectId,
      ref: 'Voucher',
      required: true,
    },
    status: {
      type: String,
      enum: ['UNUSED', 'USED', 'EXPIRED'],
      default: 'UNUSED',
    },
    usedAt: { type: Date },
    transactionId: {
      type: Schema.Types.ObjectId,
      ref: 'Transaction',
      // Chỉ lưu khi user đã áp dụng thành công vào một đơn hàng mua túi mù
    },
  },
  { timestamps: true }
);

// Đánh Index tối ưu:
// 1. Lấy danh sách voucher trong "Ví của tôi", ưu tiên hiển thị cái nào chưa dùng (UNUSED) lên trước
UserVoucherSchema.index({ userId: 1, status: 1 });

// 2. (Tùy chọn) Chống người dùng đổi cùng 1 mã voucher quá nhiều lần nếu bạn có rule này
// Bỏ comment dòng dưới nếu bạn muốn mỗi user chỉ được sở hữu 1 voucherId duy nhất cùng lúc
// UserVoucherSchema.index({ userId: 1, voucherId: 1 }, { unique: true });

const UserVoucher: Model<IUserVoucher> =
  mongoose.models.UserVoucher ||
  mongoose.model<IUserVoucher>('UserVoucher', UserVoucherSchema);

export default UserVoucher;

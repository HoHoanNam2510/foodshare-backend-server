import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ITransaction extends Document {
  postId: mongoose.Types.ObjectId;
  requesterId: mongoose.Types.ObjectId;
  ownerId: mongoose.Types.ObjectId;
  type: 'REQUEST' | 'ORDER';
  quantity: number;
  status:
    | 'PENDING'
    | 'ACCEPTED'
    | 'REJECTED'
    | 'ESCROWED'
    | 'COMPLETED'
    | 'CANCELLED';
  paymentMethod: 'FREE' | 'MOMO' | 'ZALOPAY';
  verificationCode?: string;
  expiredAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const TransactionSchema = new Schema<ITransaction>(
  {
    postId: { type: Schema.Types.ObjectId, ref: 'Post', required: true },
    requesterId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },

    type: {
      type: String,
      enum: ['REQUEST', 'ORDER'],
      required: true,
    },

    quantity: { type: Number, required: true, min: 1 },

    status: {
      type: String,
      enum: [
        'PENDING',
        'ACCEPTED',
        'REJECTED',
        'ESCROWED',
        'COMPLETED',
        'CANCELLED',
      ],
      default: 'PENDING',
    },

    paymentMethod: {
      type: String,
      enum: ['FREE', 'MOMO', 'ZALOPAY'],
      required: true,
      validate: {
        // Ràng buộc: Xin đồ (REQUEST) thì phải FREE, Mua (ORDER) thì không được FREE
        validator: function (this: any, value: string) {
          if (this.type === 'REQUEST') return value === 'FREE';
          if (this.type === 'ORDER') return value !== 'FREE';
          return true;
        },
        message:
          'Phương thức thanh toán không khớp với loại giao dịch (REQUEST phải là FREE, ORDER phải dùng Ví điện tử).',
      },
    },

    // Mã xác minh QR — sinh khi transaction được ACCEPTED (P2P) hoặc ESCROWED (B2C); sparse để tránh lỗi unique khi null
    verificationCode: { type: String, unique: true, sparse: true },

    expiredAt: { type: Date },
  },
  { timestamps: true }
);

// Đánh Index để tăng tốc độ truy vấn
// 1. Dùng khi user xem "Lịch sử xin đồ/mua hàng của tôi"
TransactionSchema.index({ requesterId: 1, createdAt: -1 });

// 2. Dùng khi chủ post/store xem "Danh sách ai đang xin/mua bài đăng này"
TransactionSchema.index({ postId: 1, status: 1 });

// CẢNH BÁO VỀ TTL INDEX:
// Không dùng index: { expires: 0 } ở field expiredAt nếu bạn muốn giữ lại lịch sử giao dịch.

const Transaction: Model<ITransaction> =
  mongoose.models.Transaction ||
  mongoose.model<ITransaction>('Transaction', TransactionSchema);

export default Transaction;

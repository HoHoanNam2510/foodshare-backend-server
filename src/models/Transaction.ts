import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ITransaction extends Document {
  postId: mongoose.Types.ObjectId;
  requesterId: mongoose.Types.ObjectId;
  ownerId: mongoose.Types.ObjectId;
  type: 'REQUEST' | 'ORDER';
  quantity: number;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'COMPLETED' | 'CANCELLED';
  paymentMethod: 'FREE' | 'BANK_TRANSFER';
  totalAmount?: number;
  verificationCode?: string;
  paymentQR?: string;
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
      enum: ['PENDING', 'ACCEPTED', 'REJECTED', 'COMPLETED', 'CANCELLED'],
      default: 'PENDING',
    },

    paymentMethod: {
      type: String,
      enum: ['FREE', 'BANK_TRANSFER'],
      required: true,
      validate: {
        // Ràng buộc: Xin đồ (REQUEST) thì phải FREE, Mua (ORDER) thì phải BANK_TRANSFER
        validator: function (this: any, value: string) {
          if (this.type === 'REQUEST') return value === 'FREE';
          if (this.type === 'ORDER') return value === 'BANK_TRANSFER';
          return true;
        },
        message:
          'Phương thức thanh toán không khớp với loại giao dịch (REQUEST phải là FREE, ORDER phải là BANK_TRANSFER).',
      },
    },

    // Tổng tiền thanh toán (price * quantity) — lưu snapshot tại thời điểm đặt hàng
    totalAmount: { type: Number, min: 0 },

    // Mã xác minh QR — sinh khi P2P REQUEST được ACCEPTED; sparse để tránh lỗi unique khi null
    verificationCode: { type: String, unique: true, sparse: true },

    // VietQR image (base64) — sinh khi store ACCEPT một B2C ORDER
    paymentQR: { type: String },
  },
  { timestamps: true }
);

// Đánh Index để tăng tốc độ truy vấn
// 1. Dùng khi user xem "Lịch sử xin đồ/mua hàng của tôi"
TransactionSchema.index({ requesterId: 1, createdAt: -1 });

// 2. Dùng khi chủ post/store xem "Danh sách ai đang xin/mua bài đăng này"
TransactionSchema.index({ postId: 1, status: 1 });

const Transaction: Model<ITransaction> =
  mongoose.models.Transaction ||
  mongoose.model<ITransaction>('Transaction', TransactionSchema);

export default Transaction;

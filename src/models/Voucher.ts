import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IVoucher extends Document {
  creatorId: mongoose.Types.ObjectId;
  code: string;
  title: string;
  description?: string;
  discountType: 'PERCENTAGE' | 'FIXED_AMOUNT'; // Thêm trường này để phân biệt logic giảm giá
  discountValue: number;
  pointCost: number;
  totalQuantity: number;
  remainingQuantity: number;
  validFrom: Date;
  validUntil: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const VoucherSchema = new Schema<IVoucher>(
  {
    creatorId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    code: {
      type: String,
      required: true,
      unique: true, // Mã voucher không được trùng lặp trên toàn hệ thống
      uppercase: true, // Ép chữ hoa cho chuyên nghiệp
      trim: true,
    },
    title: { type: String, required: true },
    description: { type: String, trim: true },

    discountType: {
      type: String,
      enum: ['PERCENTAGE', 'FIXED_AMOUNT'],
      required: true,
      default: 'FIXED_AMOUNT',
    },
    discountValue: {
      type: Number,
      required: true,
      min: 1,
    },
    pointCost: {
      type: Number,
      required: true,
      min: 0, // Số điểm cần để đổi (có thể = 0 nếu là voucher tặng free)
    },

    totalQuantity: { type: Number, required: true, min: 1 },
    remainingQuantity: { type: Number, required: true, min: 0 },

    validFrom: { type: Date, required: true },
    validUntil: { type: Date, required: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Đánh Index tối ưu:
// (code đã có index qua unique: true trong schema field, không cần khai báo lại)

// 1. Load danh sách voucher đang hiển thị trên "Cửa hàng quà tặng" (Sắp xếp theo ngày tạo)
VoucherSchema.index({ isActive: 1, validUntil: 1, remainingQuantity: 1 });

const Voucher: Model<IVoucher> =
  mongoose.models.Voucher || mongoose.model<IVoucher>('Voucher', VoucherSchema);

export default Voucher;

import mongoose, { Schema } from 'mongoose';

export interface ISoftDelete {
  isDeleted: boolean;
  deletedAt?: Date;
  deletedBy?: mongoose.Types.ObjectId;
}

/**
 * Mongoose plugin cung cấp soft delete cho bất kỳ schema nào.
 *
 * Auto-filter: mọi query find/findOne/countDocuments tự động bỏ qua isDeleted=true
 * TRỪ KHI query đã có `isDeleted` trong filter (admin queries dùng cách này để bypass).
 *
 * Ví dụ bypass (admin xem thùng rác):
 *   Post.find({ isDeleted: true })          — chỉ xem deleted
 *   Post.findOne({ _id: id, isDeleted: true }) — tìm 1 deleted item
 *   Post.find({ isDeleted: { $in: [true, false] } }) — xem tất cả
 */
export function softDeletePlugin(schema: Schema): void {
  schema.add({
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  });

  // Compound index: tra cứu thùng rác theo thời gian xóa
  schema.index({ isDeleted: 1, deletedAt: -1 });

  // Auto-filter: chỉ thêm nếu query chưa có điều kiện isDeleted nào
  schema.pre(/^find/, function (this: any) {
    const filter = this.getFilter();
    if (!Object.prototype.hasOwnProperty.call(filter, 'isDeleted')) {
      this.where({ isDeleted: { $ne: true } });
    }
  });

  // Auto-filter cho countDocuments
  schema.pre('countDocuments', function (this: any) {
    const conditions = this.getFilter();
    if (!Object.prototype.hasOwnProperty.call(conditions, 'isDeleted')) {
      this.where({ isDeleted: { $ne: true } });
    }
  });
}

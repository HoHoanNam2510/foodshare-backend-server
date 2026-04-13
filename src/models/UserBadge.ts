import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IUserBadge extends Document {
  userId: mongoose.Types.ObjectId;
  badgeId: mongoose.Types.ObjectId;
  unlockedAt: Date;
}

const UserBadgeSchema = new Schema<IUserBadge>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    badgeId: {
      type: Schema.Types.ObjectId,
      ref: 'Badge',
      required: true,
    },
    unlockedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: false }
);

// Tránh duplicate — mỗi user chỉ có thể mở khóa mỗi badge một lần
UserBadgeSchema.index({ userId: 1, badgeId: 1 }, { unique: true });

// Tối ưu query danh sách huy hiệu trên trang Profile
UserBadgeSchema.index({ userId: 1, unlockedAt: -1 });

const UserBadge: Model<IUserBadge> =
  mongoose.models.UserBadge ||
  mongoose.model<IUserBadge>('UserBadge', UserBadgeSchema);

export default UserBadge;

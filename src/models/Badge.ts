import mongoose, { Schema, Document, Model } from 'mongoose';

export type TriggerEvent =
  | 'PROFILE_COMPLETED'
  | 'POST_CREATED'
  | 'TRANSACTION_COMPLETED'
  | 'REVIEW_RECEIVED'
  | 'GREENPOINTS_AWARDED'
  | 'KYC_APPROVED';

export interface IBadge extends Document {
  code: string;
  name: string;
  description: string;
  imageUrl: string;
  targetRole: 'USER' | 'STORE' | 'BOTH';
  triggerEvent: TriggerEvent;
  pointReward: number;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const BadgeSchema = new Schema<IBadge>(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    imageUrl: {
      type: String,
      required: true,
      trim: true,
    },
    targetRole: {
      type: String,
      enum: ['USER', 'STORE', 'BOTH'],
      required: true,
    },
    triggerEvent: {
      type: String,
      enum: [
        'PROFILE_COMPLETED',
        'POST_CREATED',
        'TRANSACTION_COMPLETED',
        'REVIEW_RECEIVED',
        'GREENPOINTS_AWARDED',
        'KYC_APPROVED',
      ],
      required: true,
    },
    pointReward: {
      type: Number,
      required: true,
      min: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    sortOrder: {
      type: Number,
      default: 99,
    },
  },
  { timestamps: true }
);

// Index cho query nhanh trong checkAndAwardBadges
BadgeSchema.index({ triggerEvent: 1, isActive: 1 });
BadgeSchema.index({ sortOrder: 1 });

const Badge: Model<IBadge> =
  mongoose.models.Badge || mongoose.model<IBadge>('Badge', BadgeSchema);

export default Badge;

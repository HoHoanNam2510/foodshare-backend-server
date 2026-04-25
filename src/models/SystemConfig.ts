import mongoose, { Schema, Document, Model } from 'mongoose';

export type GracePeriodDays = 7 | 30;
export type CleanupSchedule = 'WEEKLY' | 'MONTHLY' | 'BOTH';
export type AIModerationInterval = 1 | 2 | 6 | 12 | 24;

export interface ISoftDeleteConfig {
  gracePeriodDays: GracePeriodDays;
  cleanupSchedule: CleanupSchedule;
  lastCleanupAt?: Date;
  lastCleanupCount?: number;
}

export interface IAIModerationConfig {
  enabled: boolean;
  intervalHours: AIModerationInterval;
  trustScoreThresholds: {
    reject: number;
    approve: number;
  };
  lastRunAt?: Date;
  lastRunStats?: {
    processed: number;
    approved: number;
    rejected: number;
    pendingManual: number;
  };
}

export interface ISystemConfig extends Document {
  systemBankName: string;
  systemBankCode: string;
  systemBankAccountNumber: string;
  systemBankAccountName: string;
  softDelete: ISoftDeleteConfig;
  aiModeration?: IAIModerationConfig;
  createdAt: Date;
  updatedAt: Date;
}

// Singleton — chỉ lưu 1 document duy nhất trong collection này
const SystemConfigSchema = new Schema<ISystemConfig>(
  {
    systemBankName: { type: String, required: true },
    systemBankCode: { type: String, required: true },
    systemBankAccountNumber: { type: String, required: true },
    systemBankAccountName: { type: String, required: true },

    softDelete: {
      gracePeriodDays: {
        type: Number,
        enum: [7, 30],
        default: 30,
      },
      cleanupSchedule: {
        type: String,
        enum: ['WEEKLY', 'MONTHLY', 'BOTH'],
        default: 'BOTH',
      },
      lastCleanupAt: { type: Date },
      lastCleanupCount: { type: Number, default: 0 },
    },

    aiModeration: {
      enabled: { type: Boolean, default: false },
      intervalHours: {
        type: Number,
        enum: [1, 2, 6, 12, 24],
        default: 6,
      },
      trustScoreThresholds: {
        reject: { type: Number, default: 50 },
        approve: { type: Number, default: 70 },
      },
      lastRunAt: { type: Date },
      lastRunStats: {
        processed: { type: Number, default: 0 },
        approved: { type: Number, default: 0 },
        rejected: { type: Number, default: 0 },
        pendingManual: { type: Number, default: 0 },
      },
    },
  },
  { timestamps: true }
);

const SystemConfig: Model<ISystemConfig> =
  mongoose.models.SystemConfig ||
  mongoose.model<ISystemConfig>('SystemConfig', SystemConfigSchema);

export default SystemConfig;

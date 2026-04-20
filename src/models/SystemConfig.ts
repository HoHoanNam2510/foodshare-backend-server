import mongoose, { Schema, Document, Model } from 'mongoose';

export type GracePeriodDays = 7 | 30;
export type CleanupSchedule = 'WEEKLY' | 'MONTHLY' | 'BOTH';

export interface ISoftDeleteConfig {
  gracePeriodDays: GracePeriodDays;
  cleanupSchedule: CleanupSchedule;
  lastCleanupAt?: Date;
  lastCleanupCount?: number;
}

export interface ISystemConfig extends Document {
  systemBankName: string;
  systemBankCode: string;
  systemBankAccountNumber: string;
  systemBankAccountName: string;
  softDelete: ISoftDeleteConfig;
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
  },
  { timestamps: true }
);

const SystemConfig: Model<ISystemConfig> =
  mongoose.models.SystemConfig ||
  mongoose.model<ISystemConfig>('SystemConfig', SystemConfigSchema);

export default SystemConfig;

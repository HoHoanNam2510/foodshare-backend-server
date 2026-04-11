import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ISystemConfig extends Document {
  systemBankName: string;
  systemBankCode: string;
  systemBankAccountNumber: string;
  systemBankAccountName: string;
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
  },
  { timestamps: true }
);

const SystemConfig: Model<ISystemConfig> =
  mongoose.models.SystemConfig ||
  mongoose.model<ISystemConfig>('SystemConfig', SystemConfigSchema);

export default SystemConfig;

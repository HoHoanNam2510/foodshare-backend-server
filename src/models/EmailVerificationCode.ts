import mongoose, { Document, Model, Schema } from 'mongoose';

export interface IEmailVerificationCode extends Document {
  userId: mongoose.Types.ObjectId;
  code: string;
  expiresAt: Date;
  usedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const emailVerificationCodeSchema = new Schema<IEmailVerificationCode>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    code: {
      type: String,
      required: true,
      trim: true,
      minlength: 6,
      maxlength: 6,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    usedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

emailVerificationCodeSchema.index({ userId: 1, code: 1, expiresAt: -1 });
emailVerificationCodeSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0 }
);

const EmailVerificationCode: Model<IEmailVerificationCode> =
  mongoose.models.EmailVerificationCode ||
  mongoose.model<IEmailVerificationCode>(
    'EmailVerificationCode',
    emailVerificationCodeSchema
  );

export default EmailVerificationCode;

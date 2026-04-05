import mongoose, { Document, Model, Schema } from 'mongoose';

export interface IPendingRegistration extends Document {
  email: string;
  fullName: string;
  phoneNumber?: string;
  hashedPassword: string;
  code: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const pendingRegistrationSchema = new Schema<IPendingRegistration>(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    fullName: {
      type: String,
      required: true,
      trim: true,
    },
    phoneNumber: {
      type: String,
      trim: true,
      default: '',
    },
    hashedPassword: {
      type: String,
      required: true,
    },
    code: {
      type: String,
      required: true,
      minlength: 6,
      maxlength: 6,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

pendingRegistrationSchema.index({ email: 1, code: 1 });
pendingRegistrationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const PendingRegistration: Model<IPendingRegistration> =
  mongoose.models.PendingRegistration ||
  mongoose.model<IPendingRegistration>(
    'PendingRegistration',
    pendingRegistrationSchema
  );

export default PendingRegistration;

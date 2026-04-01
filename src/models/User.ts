import mongoose, { Schema, Document, Model } from 'mongoose';

// Định nghĩa Interface cho TypeScript
export interface IUser extends Document {
  email: string;
  googleId?: string;
  phoneNumber?: string;
  password?: string;
  authProvider: 'LOCAL' | 'GOOGLE';
  isProfileCompleted: boolean;
  role: 'USER' | 'STORE' | 'ADMIN';
  fullName: string;
  avatar?: string;
  defaultAddress?: string;
  location?: {
    type: 'Point';
    coordinates: [number, number]; // [longitude, latitude]
  };
  kycStatus: 'PENDING' | 'VERIFIED' | 'REJECTED';
  kycDocuments: string[];
  storeInfo?: {
    businessName?: string;
    openHours?: string;
    closeHours?: string;
    description?: string;
    businessAddress?: string;
  };
  greenPoints: number;
  averageRating: number;
  status: 'ACTIVE' | 'BANNED';
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    googleId: { type: String, unique: true, sparse: true, trim: true },
    phoneNumber: { type: String, sparse: true }, // sparse cho phép null nhưng vẫn đánh index nếu có giá trị
    password: { type: String, select: false }, // Local account có password, Google account có thể không có
    authProvider: {
      type: String,
      enum: ['LOCAL', 'GOOGLE'],
      default: 'LOCAL',
    },
    isProfileCompleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    role: {
      type: String,
      enum: ['USER', 'STORE', 'ADMIN'],
      default: 'USER',
    },
    fullName: { type: String, required: true },
    avatar: { type: String, default: '' },
    defaultAddress: { type: String, default: '' },

    // Cấu hình GeoJSON cho Map
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number],
        default: [106.660172, 10.762622], // Mặc định tọa độ HCM (Long, Lat)
      },
    },

    kycStatus: {
      type: String,
      enum: ['PENDING', 'VERIFIED', 'REJECTED'],
      default: 'PENDING',
    },
    kycDocuments: [{ type: String }],

    storeInfo: {
      businessName: String,
      openHours: String,
      closeHours: String,
      description: String,
      businessAddress: String,
    },

    greenPoints: { type: Number, default: 0 },
    averageRating: { type: Number, default: 5.0 },
    status: {
      type: String,
      enum: ['ACTIVE', 'BANNED'],
      default: 'ACTIVE',
    },
  },
  { timestamps: true }
);

// Quan trọng: Đánh index 2dsphere để query bản đồ theo bán kính
UserSchema.index({ location: '2dsphere' });

// Tránh lỗi overwrite model trong Next.js khi hot-reload
const User: Model<IUser> =
  mongoose.models.User || mongoose.model<IUser>('User', UserSchema);

export default User;

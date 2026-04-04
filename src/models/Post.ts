import mongoose, { Schema, Document, Model } from 'mongoose';

// Định nghĩa Interface
export interface IPost extends Document {
  ownerId: mongoose.Types.ObjectId;
  type: 'P2P_FREE' | 'B2C_MYSTERY_BAG';
  category: string;
  title: string;
  description: string;
  images: string[];
  totalQuantity: number;
  remainingQuantity: number;
  price: number;
  expiryDate: Date;
  pickupTime: {
    start: Date;
    end: Date;
  };
  location?: {
    type: 'Point';
    coordinates: [number, number]; // [longitude, latitude]
  };
  status:
    | 'PENDING_REVIEW'
    | 'AVAILABLE'
    | 'BOOKED'
    | 'OUT_OF_STOCK'
    | 'HIDDEN'
    | 'REJECTED';
  publishAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const PostSchema = new Schema<IPost>(
  {
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: 'User', // Tham chiếu đến collection User
      required: true,
    },
    type: {
      type: String,
      enum: ['P2P_FREE', 'B2C_MYSTERY_BAG'],
      required: true,
    },
    category: { type: String, required: true }, // Có thể đổi thành Array nếu 1 bài thuộc nhiều danh mục
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    images: [{ type: String, required: true }], // Yêu cầu ít nhất 1 ảnh (có thể handle bằng array length validation)

    totalQuantity: { type: Number, required: true, min: 1 },
    remainingQuantity: { type: Number, required: true, min: 0 },

    price: {
      type: Number,
      default: 0,
      min: 0,
      validate: {
        // Validation tùy chỉnh: B2C thì giá phải > 0, P2P thì giá phải = 0
        validator: function (this: any, value: number) {
          if (this.type === 'P2P_FREE') return value === 0;
          if (this.type === 'B2C_MYSTERY_BAG') return value > 0;
          return true;
        },
        message:
          'Giá không hợp lệ với loại bài đăng (P2P phải = 0, B2C phải > 0)',
      },
    },

    expiryDate: { type: Date, required: true },

    pickupTime: {
      start: { type: Date, required: true },
      end: { type: Date, required: true },
    },

    // Cấu hình GeoJSON cho Map (optional — map service chưa tích hợp)
    location: {
      type: {
        type: String,
        enum: ['Point'],
      },
      coordinates: {
        type: [Number],
      },
    },

    status: {
      type: String,
      enum: [
        'PENDING_REVIEW',
        'AVAILABLE',
        'BOOKED',
        'OUT_OF_STOCK',
        'HIDDEN',
        'REJECTED',
      ],
      default: 'PENDING_REVIEW', // Đổi mặc định thành chờ duyệt thay vì available
    },

    publishAt: { type: Date }, // Optional: Dùng cho tính năng hẹn giờ đăng bài B2C
  },
  { timestamps: true }
);

// Đánh index để tối ưu Query
// 1. Index cho chức năng tìm kiếm xung quanh (Geospatial query)
PostSchema.index({ location: '2dsphere' });

// 2. Index cho việc query các bài đăng đang available của 1 user (Tối ưu tốc độ load danh sách)
PostSchema.index({ ownerId: 1, status: 1 });

// Middleware (Hook) trước khi lưu: Tự động chuyển status sang OUT_OF_STOCK nếu hết hàng
PostSchema.pre('save', function (this: IPost) {
  if (this.remainingQuantity === 0 && this.status === 'AVAILABLE') {
    this.status = 'OUT_OF_STOCK';
  }
});

const Post: Model<IPost> =
  mongoose.models.Post || mongoose.model<IPost>('Post', PostSchema);

export default Post;

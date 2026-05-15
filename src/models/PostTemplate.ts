import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IPostTemplate extends Document {
  ownerId: mongoose.Types.ObjectId;
  templateName: string;
  type: 'P2P_FREE' | 'B2C_MYSTERY_BAG';
  category: string;
  title: string;
  description?: string;
  images: string[];
  totalQuantity: number;
  price: number;
  createdAt: Date;
  updatedAt: Date;
}

const PostTemplateSchema = new Schema<IPostTemplate>(
  {
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    templateName: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ['P2P_FREE', 'B2C_MYSTERY_BAG'],
      required: true,
    },
    category: { type: String, required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    images: [{ type: String }],
    totalQuantity: { type: Number, required: true, min: 1 },
    price: {
      type: Number,
      default: 0,
      min: 0,
      validate: {
        validator: function (this: any, value: number) {
          if (this.type === 'P2P_FREE') return value === 0;
          if (this.type === 'B2C_MYSTERY_BAG') return value > 0;
          return true;
        },
        message:
          'Giá không hợp lệ với loại bài đăng (P2P phải = 0, B2C phải > 0)',
      },
    },
  },
  { timestamps: true }
);

PostTemplateSchema.index({ ownerId: 1, createdAt: -1 });

const PostTemplate: Model<IPostTemplate> =
  mongoose.models.PostTemplate ||
  mongoose.model<IPostTemplate>('PostTemplate', PostTemplateSchema);

export default PostTemplate;

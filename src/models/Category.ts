import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ICategory extends Document {
  slug: string;
  name: string;
  icon: string;
  color: string;
  applyTo: 'P2P_FREE' | 'B2C_MYSTERY_BAG' | 'BOTH';
  isSystem: boolean;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const CategorySchema = new Schema<ICategory>(
  {
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    name: { type: String, required: true, trim: true },
    icon: { type: String, required: true, trim: true },
    color: { type: String, required: true, trim: true },
    applyTo: {
      type: String,
      enum: ['P2P_FREE', 'B2C_MYSTERY_BAG', 'BOTH'],
      required: true,
    },
    isSystem: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 99 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

CategorySchema.index({ sortOrder: 1 });
CategorySchema.index({ isActive: 1, applyTo: 1 });

const Category: Model<ICategory> =
  mongoose.models.Category ||
  mongoose.model<ICategory>('Category', CategorySchema);

export default Category;

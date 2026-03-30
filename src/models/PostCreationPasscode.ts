import mongoose, { Document, Model, Schema } from 'mongoose';

export interface IPostCreationPasscode extends Document {
  userId: mongoose.Types.ObjectId;
  code: string;
  expiresAt: Date;
  usedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const postCreationPasscodeSchema = new Schema<IPostCreationPasscode>(
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
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

postCreationPasscodeSchema.index({ userId: 1, code: 1, expiresAt: -1 });
postCreationPasscodeSchema.index({ userId: 1, createdAt: -1 });
postCreationPasscodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const PostCreationPasscode: Model<IPostCreationPasscode> =
  mongoose.models.PostCreationPasscode ||
  mongoose.model<IPostCreationPasscode>(
    'PostCreationPasscode',
    postCreationPasscodeSchema
  );

export default PostCreationPasscode;

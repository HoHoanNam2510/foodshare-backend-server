import mongoose, { Schema, Document, Model } from 'mongoose';

export type FeedbackType = 'BUG_REPORT' | 'SUGGESTION';
export type FeedbackPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type FeedbackStatus = 'PENDING' | 'PROCESSING' | 'CLOSED';
export type FeedbackUserType = 'INDIVIDUAL' | 'STORE';

export interface IFeedback extends Document {
  userId: mongoose.Types.ObjectId;
  userType: FeedbackUserType;
  type: FeedbackType;
  priority: FeedbackPriority;
  status: FeedbackStatus;
  title: string;
  content: string;
  attachments: string[];
  contextMetadata: {
    appVersion?: string;
    os?: 'ios' | 'android' | 'web';
    relatedEntityId?: string;
  };
  adminId?: mongoose.Types.ObjectId;
  adminReply?: string;
  resolvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const FeedbackSchema = new Schema<IFeedback>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    userType: {
      type: String,
      enum: ['INDIVIDUAL', 'STORE'],
      required: true,
    },
    type: {
      type: String,
      enum: ['BUG_REPORT', 'SUGGESTION'],
      required: true,
    },
    priority: {
      type: String,
      enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
      required: true,
    },
    status: {
      type: String,
      enum: ['PENDING', 'PROCESSING', 'CLOSED'],
      default: 'PENDING',
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    content: {
      type: String,
      required: true,
      trim: true,
    },
    attachments: [
      {
        type: String,
      },
    ],
    contextMetadata: {
      appVersion: { type: String },
      os: { type: String, enum: ['ios', 'android', 'web'] },
      relatedEntityId: { type: String },
    },
    adminId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    adminReply: {
      type: String,
      trim: true,
    },
    resolvedAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

FeedbackSchema.index({ userId: 1, createdAt: -1 });
FeedbackSchema.index({ status: 1, createdAt: -1 });
FeedbackSchema.index({ type: 1, priority: 1 });

const Feedback: Model<IFeedback> =
  mongoose.models.Feedback ||
  mongoose.model<IFeedback>('Feedback', FeedbackSchema);

export default Feedback;

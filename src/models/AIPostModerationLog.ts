import mongoose, { Schema, Document, Model } from 'mongoose';

export type ModerationDecision = 'APPROVED' | 'REJECTED' | 'PENDING_MANUAL';
export type ModerationTrigger =
  | 'ON_CREATE'
  | 'ON_UPDATE'
  | 'BATCH_SCHEDULER'
  | 'MANUAL_ADMIN';

export interface IAIPostModerationLog extends Document {
  postId: mongoose.Types.ObjectId;
  postTitle: string;
  trustScore: number;
  reason: string;
  decision: ModerationDecision;
  trigger: ModerationTrigger;
  createdAt: Date;
  updatedAt: Date;
}

const AIPostModerationLogSchema = new Schema<IAIPostModerationLog>(
  {
    postId: { type: Schema.Types.ObjectId, ref: 'Post', required: true },
    postTitle: { type: String, required: true },
    trustScore: { type: Number, required: true, min: 0, max: 100 },
    reason: { type: String, required: true },
    decision: {
      type: String,
      enum: ['APPROVED', 'REJECTED', 'PENDING_MANUAL'],
      required: true,
    },
    trigger: {
      type: String,
      enum: ['ON_CREATE', 'ON_UPDATE', 'BATCH_SCHEDULER', 'MANUAL_ADMIN'],
      required: true,
    },
  },
  { timestamps: true }
);

AIPostModerationLogSchema.index({ postId: 1 });
AIPostModerationLogSchema.index({ createdAt: -1 });

const AIPostModerationLog: Model<IAIPostModerationLog> =
  mongoose.models.AIPostModerationLog ||
  mongoose.model<IAIPostModerationLog>(
    'AIPostModerationLog',
    AIPostModerationLogSchema
  );

export default AIPostModerationLog;

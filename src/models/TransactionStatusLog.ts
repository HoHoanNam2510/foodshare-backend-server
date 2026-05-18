import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ITransactionStatusLog extends Document {
  transactionId: mongoose.Types.ObjectId;
  previousStatus: string;
  newStatus: string;
  changedBy: mongoose.Types.ObjectId;
  createdAt: Date;
}

const TransactionStatusLogSchema = new Schema<ITransactionStatusLog>(
  {
    transactionId: {
      type: Schema.Types.ObjectId,
      ref: 'Transaction',
      required: true,
    },
    previousStatus: { type: String, required: true },
    newStatus: { type: String, required: true },
    changedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

TransactionStatusLogSchema.index({ transactionId: 1, createdAt: -1 });
TransactionStatusLogSchema.index({ createdAt: -1 });

const TransactionStatusLog: Model<ITransactionStatusLog> =
  mongoose.models.TransactionStatusLog ||
  mongoose.model<ITransactionStatusLog>(
    'TransactionStatusLog',
    TransactionStatusLogSchema
  );

export default TransactionStatusLog;

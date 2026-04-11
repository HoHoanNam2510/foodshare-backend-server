import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IEscrowLedger extends Document {
  transactionId: mongoose.Types.ObjectId;
  storeId: mongoose.Types.ObjectId;
  buyerId: mongoose.Types.ObjectId;
  amount: number;
  platformFee: number;
  netAmount: number;
  paymentMethod: 'BANK_TRANSFER';
  paymentTransId: string;
  status: 'HOLDING' | 'DISBURSED' | 'REFUNDED';
  disbursedAt?: Date;
  refundedAt?: Date;
  refundReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const EscrowLedgerSchema = new Schema<IEscrowLedger>(
  {
    transactionId: {
      type: Schema.Types.ObjectId,
      ref: 'Transaction',
      required: true,
      unique: true,
    },
    storeId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    buyerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },

    amount: { type: Number, required: true, min: 0 },
    platformFee: { type: Number, required: true, default: 0, min: 0 },
    netAmount: { type: Number, required: true, min: 0 },

    paymentMethod: {
      type: String,
      enum: ['BANK_TRANSFER'],
      required: true,
    },
    paymentTransId: { type: String, required: true },

    status: {
      type: String,
      enum: ['HOLDING', 'DISBURSED', 'REFUNDED'],
      default: 'HOLDING',
    },

    disbursedAt: { type: Date },
    refundedAt: { type: Date },
    refundReason: { type: String },
  },
  { timestamps: true }
);

// Tra cứu nhanh escrow chờ giải ngân theo store
EscrowLedgerSchema.index({ storeId: 1, status: 1 });

const EscrowLedger: Model<IEscrowLedger> =
  mongoose.models.EscrowLedger ||
  mongoose.model<IEscrowLedger>('EscrowLedger', EscrowLedgerSchema);

export default EscrowLedger;

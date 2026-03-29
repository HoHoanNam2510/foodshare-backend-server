import mongoose, { Schema, Document, Model } from 'mongoose';

export type ConversationStatus = 'ACTIVE' | 'LOCKED';

export interface IConversation extends Document {
  transactionId?: mongoose.Types.ObjectId;
  participants: mongoose.Types.ObjectId[];
  lastMessage?: mongoose.Types.ObjectId;
  lastMessageAt?: Date;
  unreadCount: Map<string, number>;
  status: ConversationStatus;
  createdAt: Date;
  updatedAt: Date;
}

const ConversationSchema = new Schema<IConversation>(
  {
    transactionId: {
      type: Schema.Types.ObjectId,
      ref: 'Transaction',
    },
    // Lưu mảng ID của 2 người chat với nhau
    participants: [
      { type: Schema.Types.ObjectId, ref: 'User', required: true },
    ],
    // Ref đến Message cuối cùng để populate hiển thị ở danh sách chat
    lastMessage: { type: Schema.Types.ObjectId, ref: 'Message', default: null },
    lastMessageAt: { type: Date, default: Date.now },
    // Lưu số tin nhắn chưa đọc cho từng participant (key = UserId string)
    unreadCount: {
      type: Map,
      of: Number,
      default: {},
    },
    // Hỗ trợ tính năng Khóa Chat của Admin (ADM_C02)
    status: {
      type: String,
      enum: ['ACTIVE', 'LOCKED'],
      default: 'ACTIVE',
    },
  },
  { timestamps: true }
);

// Đánh Index để tối ưu:
// 1. Khi user mở tab Tin nhắn -> Lấy danh sách các cuộc hội thoại của user đó, sắp xếp theo thời gian mới nhất
ConversationSchema.index({ participants: 1, updatedAt: -1 });

// 2. Tìm nhanh phòng chat dựa vào transactionId
ConversationSchema.index({ transactionId: 1 });

const Conversation: Model<IConversation> =
  mongoose.models.Conversation ||
  mongoose.model<IConversation>('Conversation', ConversationSchema);

export default Conversation;

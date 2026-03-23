import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IConversation extends Document {
  transactionId?: mongoose.Types.ObjectId; // Thêm dấu ? để biến thành tùy chọn (optional)
  participants: mongoose.Types.ObjectId[];
  lastMessage?: string;
  lastMessageAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ConversationSchema = new Schema<IConversation>(
  {
    transactionId: {
      type: Schema.Types.ObjectId,
      ref: 'Transaction',
      // Đã xóa dòng required: true ở đây
    },
    // Lưu mảng ID của 2 người chat với nhau
    participants: [
      { type: Schema.Types.ObjectId, ref: 'User', required: true },
    ],
    // Cache lại tin nhắn cuối cùng để hiển thị ở danh sách ngoài màn hình Chat
    lastMessage: { type: String, default: '' },
    lastMessageAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Đánh Index để tối ưu:
// 1. Khi user mở tab Tin nhắn -> Lấy danh sách các cuộc hội thoại của user đó, sắp xếp theo thời gian tin nhắn mới nhất
ConversationSchema.index({ participants: 1, lastMessageAt: -1 });

// 2. Tìm nhanh phòng chat dựa vào transactionId (Vẫn giữ index này vì thao tác tìm phòng chat theo đơn hàng diễn ra rất thường xuyên)
ConversationSchema.index({ transactionId: 1 });

const Conversation: Model<IConversation> =
  mongoose.models.Conversation ||
  mongoose.model<IConversation>('Conversation', ConversationSchema);

export default Conversation;

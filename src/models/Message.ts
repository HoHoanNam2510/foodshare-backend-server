import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IMessage extends Document {
  conversationId: mongoose.Types.ObjectId;
  senderId: mongoose.Types.ObjectId;
  messageType: 'TEXT' | 'IMAGE' | 'LOCATION';
  content: string;
  createdAt: Date;
}

const MessageSchema = new Schema<IMessage>(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
    },
    senderId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    messageType: {
      type: String,
      enum: ['TEXT', 'IMAGE', 'LOCATION'],
      default: 'TEXT',
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
  },
  { timestamps: { updatedAt: false } } // Tắt updatedAt vì tin nhắn thường không sửa
);

// Đánh Index để tối ưu:
// Khi bấm vào 1 phòng chat -> Load toàn bộ tin nhắn của phòng đó theo thứ tự thời gian cũ -> mới
MessageSchema.index({ conversationId: 1, createdAt: 1 });

const Message: Model<IMessage> =
  mongoose.models.Message || mongoose.model<IMessage>('Message', MessageSchema);

export default Message;

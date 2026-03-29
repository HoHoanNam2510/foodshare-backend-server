import mongoose, { Schema, Document, Model } from 'mongoose';

export type MessageType = 'TEXT' | 'IMAGE' | 'LOCATION';

export interface IMessage extends Document {
  conversationId: mongoose.Types.ObjectId;
  senderId: mongoose.Types.ObjectId;
  messageType: MessageType;
  content: string;
  imageUrl?: string;
  location?: {
    latitude: number;
    longitude: number;
  };
  relatedPostId?: mongoose.Types.ObjectId;
  isRead: boolean;
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
    imageUrl: {
      type: String,
      default: undefined,
    },
    location: {
      latitude: { type: Number },
      longitude: { type: Number },
    },
    relatedPostId: {
      type: Schema.Types.ObjectId,
      ref: 'Post',
      default: undefined,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: { updatedAt: false } } // Tắt updatedAt vì tin nhắn thường không sửa
);

// Đánh Index để tối ưu:
// 1. Load tin nhắn của phòng chat theo thứ tự thời gian
MessageSchema.index({ conversationId: 1, createdAt: 1 });

// 2. Tối ưu truy vấn markAsRead (tìm tin nhắn chưa đọc của người nhận)
MessageSchema.index({ conversationId: 1, senderId: 1, isRead: 1 });

const Message: Model<IMessage> =
  mongoose.models.Message || mongoose.model<IMessage>('Message', MessageSchema);

export default Message;

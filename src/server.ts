import express, { Express, Request, Response } from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';

import authRoutes from './routes/authRoutes';
import postRoutes from './routes/postRoutes';
import transactionRoutes from './routes/transactionRoutes';
import userRoutes from './routes/userRoutes';
import reportRoutes from './routes/reportRoutes';
import chatRoutes from './routes/chatRoutes';
import voucherRoutes from './routes/voucherRoutes';
import greenPointRoutes from './routes/greenPointRoutes';
import reviewRoutes from './routes/reviewRoutes';

// Load biến môi trường từ file .env
dotenv.config();

const app: Express = express();
const httpServer = createServer(app);

// Khởi tạo Socket.io (Đã giải quyết xong CORS cho web admin và mobile)
const io = new Server(httpServer, {
  cors: {
    origin: '*', // Có thể chỉnh lại URL của Web Admin khi deploy thật
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  },
});

const PORT = Number(process.env.PORT) || 5000;
const MONGODB_URI = process.env.MONGODB_URI as string;

// Middlewares cơ bản
app.use(cors());
app.use(express.json()); // Thay thế cho body-parser
app.use(express.urlencoded({ extended: true }));

// Test Route cơ bản
app.get('/', (req: Request, res: Response) => {
  res.json({
    message: 'Chào mừng đến với API FoodShare Backend (Express + TypeScript)!',
  });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/users', userRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/vouchers', voucherRoutes);
app.use('/api/greenpoints', greenPointRoutes);
app.use('/api/reviews', reviewRoutes);

// Kết nối MongoDB và Khởi động Server
mongoose
  .connect(MONGODB_URI)
  .then(() => {
    console.log('✅ Đã kết nối MongoDB thành công!');

    // Chỉ khởi động server khi đã kết nối DB xong
    httpServer.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Server đang chạy tại http://0.0.0.0:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('❌ Lỗi kết nối MongoDB:', error);
    process.exit(1);
  });

// Lắng nghe các kết nối Socket.io (Chat Realtime sau này viết ở đây)
io.on('connection', (socket) => {
  console.log(`🔌 Một người dùng vừa kết nối Socket: ${socket.id}`);

  socket.on('disconnect', () => {
    console.log(`❌ Người dùng ${socket.id} đã ngắt kết nối`);
  });
});

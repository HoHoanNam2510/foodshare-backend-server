import 'dotenv/config';
import express, { Express, Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import { createServer } from 'http';
import morgan from 'morgan';
import { Server } from 'socket.io';

import jwt from 'jsonwebtoken';
import authRoutes from './routes/authRoutes';
import postRoutes from './routes/postRoutes';
import transactionRoutes from './routes/transactionRoutes';
import userRoutes from './routes/userRoutes';
import reportRoutes from './routes/reportRoutes';
import chatRoutes from './routes/chatRoutes';
import voucherRoutes from './routes/voucherRoutes';
import greenPointRoutes from './routes/greenPointRoutes';
import reviewRoutes from './routes/reviewRoutes';
import uploadRoutes from './routes/uploadRoutes';
import paymentRoutes from './routes/paymentRoutes';
import dashboardRoutes from './routes/dashboardRoutes';
import configRoutes from './routes/configRoutes';
import badgeRoutes from './routes/badgeRoutes';
import translateRoutes from './routes/translateRoutes';
import trashRoutes from './routes/trashRoutes';
import notificationRoutes from './routes/notificationRoutes';
import logger from './utils/logger';
import { startScheduler } from './utils/scheduler';
import { initNotificationService } from './services/notificationService';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_key_for_dev';

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
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// HTTP request logging
app.use(
  morgan('short', {
    stream: { write: (message: string) => logger.info(message.trim()) },
  })
);

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
app.use('/api/upload', uploadRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/config', configRoutes);
app.use('/api/badges', badgeRoutes);
app.use('/api/translate', translateRoutes);
app.use('/api/admin/trash', trashRoutes);
app.use('/api/notifications', notificationRoutes);

// Global error handler — log mọi lỗi chưa bắt
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  logger.error(`${req.method} ${req.originalUrl} — ${err.message}`, {
    stack: err.stack,
  });
  const statusCode = (err as Error & { statusCode?: number }).statusCode || 500;
  res.status(statusCode).json({
    success: false,
    message:
      process.env.NODE_ENV === 'production'
        ? 'Đã xảy ra lỗi từ phía server'
        : err.message,
  });
});

// Kết nối MongoDB và Khởi động Server
mongoose
  .connect(MONGODB_URI)
  .then(() => {
    logger.info('✅ Đã kết nối MongoDB thành công!');

    // Khởi chạy cron jobs (pickup deadline, payment timeout)
    startScheduler();

    // Khởi tạo notification service với io instance
    initNotificationService(io);

    // Chỉ khởi động server khi đã kết nối DB xong
    httpServer.listen(PORT, '0.0.0.0', () => {
      logger.info(`🚀 Server đang chạy tại http://0.0.0.0:${PORT}`);
    });

    // Tăng timeout cho upload ảnh lớn (5 phút)
    httpServer.requestTimeout = 5 * 60 * 1000;
    httpServer.headersTimeout = 60 * 1000;
    httpServer.keepAliveTimeout = 120 * 1000;
  })
  .catch((error) => {
    logger.error('❌ Lỗi kết nối MongoDB:', error);
    process.exit(1);
  });

// Socket.io JWT authentication middleware — set socket.data.userId nếu token hợp lệ
io.use((socket, next) => {
  const token =
    (socket.handshake.auth as { token?: string }).token ||
    (socket.handshake.headers.authorization as string | undefined)?.replace('Bearer ', '');

  if (token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET) as { id: string };
      socket.data.userId = payload.id;
    } catch {
      // Token không hợp lệ — socket vẫn kết nối được, chỉ không có userId
    }
  }
  next();
});

// Lắng nghe các kết nối Socket.io (Chat Realtime)
io.on('connection', (socket) => {
  logger.info(`🔌 Socket kết nối: ${socket.id}`);

  // Auto-join personal notification room nếu đã xác thực
  if (socket.data.userId) {
    socket.join(`user:${socket.data.userId}`);
    logger.info(`Socket ${socket.id} đã join room: user:${socket.data.userId}`);
  }

  // Client tham gia phòng chat
  socket.on('join-room', (conversationId: string) => {
    socket.join(conversationId);
    logger.info(`Socket ${socket.id} đã vào phòng: ${conversationId}`);
  });

  // Client rời phòng chat
  socket.on('leave-room', (conversationId: string) => {
    socket.leave(conversationId);
    logger.info(`Socket ${socket.id} đã rời phòng: ${conversationId}`);
  });

  // Client gửi tin nhắn (sau khi đã lưu vào DB qua REST API)
  // Server chỉ broadcast lại cho tất cả client trong phòng
  socket.on('client-message', (data: { conversationId: string; message: unknown }) => {
    io.to(data.conversationId).emit('new-message', data.message);
  });

  socket.on('disconnect', () => {
    logger.info(`❌ Socket ngắt kết nối: ${socket.id}`);
  });
});

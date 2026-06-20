import 'dotenv/config';

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}
if (!process.env.MONGODB_URI) {
  throw new Error('MONGODB_URI environment variable is required');
}

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
import dashboardRoutes from './routes/dashboardRoutes';
import configRoutes from './routes/configRoutes';
import badgeRoutes from './routes/badgeRoutes';
import translateRoutes from './routes/translateRoutes';
import statisticsRoutes from './routes/statisticsRoutes';
import trashRoutes from './routes/trashRoutes';
import notificationRoutes from './routes/notificationRoutes';
import feedbackRoutes from './routes/feedbackRoutes';
import categoryRoutes from './routes/categoryRoutes';
import postTemplateRoutes from './routes/postTemplateRoutes';
import { seedCategories } from './seeds/categorySeeder';
import User from './models/User';
import logger from './utils/logger';
import { startScheduler } from './utils/scheduler';
import { initNotificationService } from './services/notificationService';
import { onlineUsers } from './utils/presenceStore';

const JWT_SECRET = process.env.JWT_SECRET as string;

const app: Express = express();
const httpServer = createServer(app);

const CORS_ALLOWED_ORIGINS = process.env.CORS_ALLOWED_ORIGINS
  ? process.env.CORS_ALLOWED_ORIGINS.split(',').map((o) => o.trim())
  : ['http://localhost:3001', 'http://localhost:3000'];

const io = new Server(httpServer, {
  cors: {
    origin: CORS_ALLOWED_ORIGINS,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  },
});

const PORT = Number(process.env.PORT) || 5000;
const MONGODB_URI = process.env.MONGODB_URI as string;

// Middlewares cơ bản
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

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

// Health check — dùng cho load balancer / container orchestration
app.get('/health', (_req: Request, res: Response) => {
  const dbState = mongoose.connection.readyState;
  const status = dbState === 1 ? 'ok' : 'degraded';
  res.status(dbState === 1 ? 200 : 503).json({
    status,
    uptime: process.uptime(),
    db: dbState === 1 ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
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
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/config', configRoutes);
app.use('/api/statistics', statisticsRoutes);
app.use('/api/badges', badgeRoutes);
app.use('/api/translate', translateRoutes);
app.use('/api/admin/trash', trashRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/post-templates', postTemplateRoutes);
app.use('/api/feedbacks', feedbackRoutes);

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

process.on('unhandledRejection', (reason: unknown) => {
  logger.error('[Process] Unhandled Promise Rejection:', { reason });
});

process.on('uncaughtException', (error: Error) => {
  logger.error('[Process] Uncaught Exception — shutting down:', { error });
  process.exit(1);
});

// Kết nối MongoDB và Khởi động Server
mongoose
  .connect(MONGODB_URI)
  .then(async () => {
    logger.info('✅ Đã kết nối MongoDB thành công!');

    // Seed dữ liệu mặc định (idempotent)
    await seedCategories();

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
    (socket.handshake.headers.authorization as string | undefined)?.replace(
      'Bearer ',
      ''
    );

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

  const userId = socket.data.userId as string | undefined;

  // Auto-join personal notification room nếu đã xác thực
  if (userId) {
    socket.join(`user:${userId}`);
    logger.info(`Socket ${socket.id} đã join room: user:${userId}`);

    // Cập nhật presence: thêm socket vào Set; nếu trước đó offline → báo online
    let sockets = onlineUsers.get(userId);
    if (!sockets) {
      sockets = new Set();
      onlineUsers.set(userId, sockets);
    }
    const wasOffline = sockets.size === 0;
    sockets.add(socket.id);
    if (wasOffline) {
      io.to(`presence:${userId}`).emit('presence:update', {
        userId,
        online: true,
      });
    }
  }

  // Client theo dõi trạng thái online của 1 user (khi mở màn hình chat)
  socket.on('subscribe-presence', (targetUserId: string) => {
    if (!targetUserId) return;
    socket.join(`presence:${targetUserId}`);
    const online = (onlineUsers.get(targetUserId)?.size ?? 0) > 0;
    socket.emit('presence:update', { userId: targetUserId, online });
  });

  // Client ngừng theo dõi (rời màn hình chat)
  socket.on('unsubscribe-presence', (targetUserId: string) => {
    socket.leave(`presence:${targetUserId}`);
  });

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
  socket.on(
    'client-message',
    (data: { conversationId: string; message: unknown }) => {
      io.to(data.conversationId).emit('new-message', data.message);
    }
  );

  // Client relay sau khi sửa tin nhắn thành công qua REST API
  socket.on(
    'client-message-update',
    (data: { conversationId: string; message: unknown }) => {
      io.to(data.conversationId).emit('message:updated', data.message);
    }
  );

  // Client relay sau khi thu hồi tin nhắn thành công qua REST API
  socket.on(
    'client-message-recall',
    (data: { conversationId: string; messageId: string }) => {
      io.to(data.conversationId).emit('message:recalled', {
        messageId: data.messageId,
      });
    }
  );

  socket.on('disconnect', async () => {
    logger.info(`❌ Socket ngắt kết nối: ${socket.id}`);

    if (!userId) return;
    const sockets = onlineUsers.get(userId);
    if (!sockets) return;
    sockets.delete(socket.id);

    // Chỉ báo offline khi user không còn socket nào kết nối
    if (sockets.size === 0) {
      onlineUsers.delete(userId);
      const lastSeen = new Date();
      io.to(`presence:${userId}`).emit('presence:update', {
        userId,
        online: false,
        lastSeen,
      });
      try {
        await User.findByIdAndUpdate(userId, { lastSeen });
      } catch (err) {
        logger.error(`Không thể cập nhật lastSeen cho user ${userId}`, err);
      }
    }
  });
});

// Graceful shutdown — đảm bảo in-flight requests hoàn thành trước khi tắt server
const gracefulShutdown = (signal: string) => {
  logger.info(`[Server] ${signal} received — shutting down gracefully`);
  httpServer.close(async () => {
    logger.info('[Server] HTTP server closed');
    await mongoose.connection.close();
    logger.info('[Server] MongoDB connection closed');
    process.exit(0);
  });
  // Force exit sau 10 giây nếu server không close được
  setTimeout(() => {
    logger.error('[Server] Graceful shutdown timed out — forcing exit');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

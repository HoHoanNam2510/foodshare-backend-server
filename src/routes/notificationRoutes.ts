import { Router } from 'express';
import { verifyAuth, verifyAdmin } from '@/middlewares/authMiddleware';
import {
  getMyNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  savePushToken,
  adminBroadcastNotification,
  adminGetBroadcastHistory,
} from '@/controllers/notificationController';

const router = Router();

// User notification routes
router.get('/', verifyAuth, getMyNotifications);
router.get('/unread-count', verifyAuth, getUnreadCount);
router.patch('/read-all', verifyAuth, markAllAsRead);
router.patch('/:id/read', verifyAuth, markAsRead);
router.delete('/:id', verifyAuth, deleteNotification);
router.put('/push-token', verifyAuth, savePushToken);

// Admin broadcast routes
router.post(
  '/admin/broadcast',
  verifyAuth,
  verifyAdmin,
  adminBroadcastNotification
);
router.get('/admin/history', verifyAuth, verifyAdmin, adminGetBroadcastHistory);

export default router;

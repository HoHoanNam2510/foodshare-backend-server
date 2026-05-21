import { Router } from 'express';
import { verifyAuth, verifyAdmin } from '@/middlewares/authMiddleware';
import { validateBody } from '@/middlewares/validateBodyMiddleware';
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
import {
  savePushTokenSchema,
  adminBroadcastSchema,
} from '@/validations/notificationValidation';

const router = Router();

// User notification routes
router.get('/', verifyAuth, getMyNotifications);
router.get('/unread-count', verifyAuth, getUnreadCount);
router.patch('/read-all', verifyAuth, markAllAsRead);
router.patch('/:id/read', verifyAuth, markAsRead);
router.delete('/:id', verifyAuth, deleteNotification);
router.put(
  '/push-token',
  verifyAuth,
  validateBody(savePushTokenSchema),
  savePushToken
);

// Admin broadcast routes
router.post(
  '/admin/broadcast',
  verifyAuth,
  verifyAdmin,
  validateBody(adminBroadcastSchema),
  adminBroadcastNotification
);
router.get('/admin/history', verifyAuth, verifyAdmin, adminGetBroadcastHistory);

export default router;

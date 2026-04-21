import { Router } from 'express';
import { verifyAuth } from '@/middlewares/authMiddleware';
import {
  getMyNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  savePushToken,
} from '@/controllers/notificationController';

const router = Router();

router.get('/', verifyAuth, getMyNotifications);
router.get('/unread-count', verifyAuth, getUnreadCount);
// read-all MUST come before /:id/read to avoid Express parsing "read-all" as ObjectId
router.patch('/read-all', verifyAuth, markAllAsRead);
router.patch('/:id/read', verifyAuth, markAsRead);
router.delete('/:id', verifyAuth, deleteNotification);
router.put('/push-token', verifyAuth, savePushToken);

export default router;

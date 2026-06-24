import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import notificationRoutes from '@/routes/notificationRoutes';

jest.mock('@/controllers/notificationController', () => ({
  __esModule: true,
  getMyNotifications: jest.fn((req, res) =>
    res.status(200).json({ success: true, data: [] })
  ),
  getUnreadCount: jest.fn((req, res) =>
    res.status(200).json({ success: true, data: { count: 3 } })
  ),
  markAsRead: jest.fn((req, res) =>
    res.status(200).json({ success: true, message: 'Đã đánh dấu đã đọc' })
  ),
  markAllAsRead: jest.fn((req, res) =>
    res
      .status(200)
      .json({ success: true, message: 'Đã đánh dấu tất cả đã đọc' })
  ),
  deleteNotification: jest.fn((req, res) =>
    res.status(200).json({ success: true, message: 'Đã xóa thông báo' })
  ),
  deleteAllRead: jest.fn((req, res) =>
    res.status(200).json({ success: true, message: 'Đã xóa tất cả đã đọc' })
  ),
  deleteMany: jest.fn((req, res) =>
    res.status(200).json({ success: true, message: 'Đã xóa hàng loạt' })
  ),
  savePushToken: jest.fn((req, res) =>
    res.status(200).json({ success: true, message: 'Đã lưu push token' })
  ),
  adminBroadcastNotification: jest.fn((req, res) =>
    res.status(201).json({ success: true, data: { id: 'broadcast-id' } })
  ),
  adminGetBroadcastHistory: jest.fn((req, res) =>
    res.status(200).json({ success: true, data: [] })
  ),
}));

process.env.JWT_SECRET = 'test-secret';

function createToken(role: 'USER' | 'STORE' | 'ADMIN'): string {
  return jwt.sign(
    { id: '507f191e810c19729de860ea', role },
    process.env.JWT_SECRET as string,
    { expiresIn: '1h' }
  );
}

describe('notificationRoutes', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/notifications', notificationRoutes);

  // GET / — xem danh sách thông báo
  describe('GET /', () => {
    it('returns 401 without token', async () => {
      const response = await request(app).get('/api/notifications');
      expect(response.status).toBe(401);
    });

    it('returns 200 with valid USER token', async () => {
      const token = createToken('USER');
      const response = await request(app)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${token}`);
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('returns 200 with valid STORE token', async () => {
      const token = createToken('STORE');
      const response = await request(app)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${token}`);
      expect(response.status).toBe(200);
    });
  });

  // GET /unread-count — đếm thông báo chưa đọc
  describe('GET /unread-count', () => {
    it('returns 401 without token', async () => {
      const response = await request(app).get(
        '/api/notifications/unread-count'
      );
      expect(response.status).toBe(401);
    });

    it('returns 200 with valid token', async () => {
      const token = createToken('USER');
      const response = await request(app)
        .get('/api/notifications/unread-count')
        .set('Authorization', `Bearer ${token}`);
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  // PATCH /read-all — đánh dấu tất cả đã đọc
  describe('PATCH /read-all', () => {
    it('returns 401 without token', async () => {
      const response = await request(app).patch('/api/notifications/read-all');
      expect(response.status).toBe(401);
    });

    it('returns 200 with valid token', async () => {
      const token = createToken('USER');
      const response = await request(app)
        .patch('/api/notifications/read-all')
        .set('Authorization', `Bearer ${token}`);
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  // PATCH /:id/read — đánh dấu 1 thông báo đã đọc
  describe('PATCH /:id/read', () => {
    it('returns 401 without token', async () => {
      const response = await request(app).patch(
        '/api/notifications/507f191e810c19729de860ea/read'
      );
      expect(response.status).toBe(401);
    });

    it('returns 200 with valid token', async () => {
      const token = createToken('USER');
      const response = await request(app)
        .patch('/api/notifications/507f191e810c19729de860ea/read')
        .set('Authorization', `Bearer ${token}`);
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  // DELETE /:id — xóa 1 thông báo
  describe('DELETE /:id', () => {
    it('returns 401 without token', async () => {
      const response = await request(app).delete(
        '/api/notifications/507f191e810c19729de860ea'
      );
      expect(response.status).toBe(401);
    });

    it('returns 200 with valid token', async () => {
      const token = createToken('USER');
      const response = await request(app)
        .delete('/api/notifications/507f191e810c19729de860ea')
        .set('Authorization', `Bearer ${token}`);
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  // DELETE /read-all — xóa tất cả đã đọc
  describe('DELETE /read-all', () => {
    it('returns 401 without token', async () => {
      const response = await request(app).delete('/api/notifications/read-all');
      expect(response.status).toBe(401);
    });

    it('returns 200 with valid token', async () => {
      const token = createToken('USER');
      const response = await request(app)
        .delete('/api/notifications/read-all')
        .set('Authorization', `Bearer ${token}`);
      expect(response.status).toBe(200);
    });
  });

  // DELETE /batch — xóa nhiều thông báo
  describe('DELETE /batch', () => {
    it('returns 401 without token', async () => {
      const response = await request(app)
        .delete('/api/notifications/batch')
        .send({ ids: ['507f191e810c19729de860ea'] });
      expect(response.status).toBe(401);
    });

    it('returns 400 when ids is empty', async () => {
      const token = createToken('USER');
      const response = await request(app)
        .delete('/api/notifications/batch')
        .set('Authorization', `Bearer ${token}`)
        .send({ ids: [] });
      expect(response.status).toBe(400);
    });

    it('returns 200 with valid ids', async () => {
      const token = createToken('USER');
      const response = await request(app)
        .delete('/api/notifications/batch')
        .set('Authorization', `Bearer ${token}`)
        .send({ ids: ['507f191e810c19729de860ea'] });
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  // POST /admin/broadcast — admin phát thông báo hàng loạt
  describe('POST /admin/broadcast', () => {
    it('returns 401 without token', async () => {
      const response = await request(app)
        .post('/api/notifications/admin/broadcast')
        .send({
          targetRole: 'ALL',
          title: 'Hello',
          body: 'World',
          type: 'SYSTEM',
        });
      expect(response.status).toBe(401);
    });

    it('returns 403 with non-admin token', async () => {
      const token = createToken('USER');
      const response = await request(app)
        .post('/api/notifications/admin/broadcast')
        .set('Authorization', `Bearer ${token}`)
        .send({
          targetRole: 'ALL',
          title: 'Hello',
          body: 'World',
          type: 'SYSTEM',
        });
      expect(response.status).toBe(403);
    });

    it('returns 400 when body is missing required fields', async () => {
      const token = createToken('ADMIN');
      const response = await request(app)
        .post('/api/notifications/admin/broadcast')
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect(response.status).toBe(400);
    });

    it('returns 201 with valid admin token and body', async () => {
      const token = createToken('ADMIN');
      const response = await request(app)
        .post('/api/notifications/admin/broadcast')
        .set('Authorization', `Bearer ${token}`)
        .send({
          targetRole: 'ALL',
          title: 'System Maintenance',
          body: 'Hệ thống sẽ bảo trì lúc 2h sáng ngày mai',
          type: 'SYSTEM',
        });
      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
    });
  });

  // GET /admin/history — xem lịch sử broadcast
  describe('GET /admin/history', () => {
    it('returns 401 without token', async () => {
      const response = await request(app).get(
        '/api/notifications/admin/history'
      );
      expect(response.status).toBe(401);
    });

    it('returns 403 with non-admin token', async () => {
      const token = createToken('USER');
      const response = await request(app)
        .get('/api/notifications/admin/history')
        .set('Authorization', `Bearer ${token}`);
      expect(response.status).toBe(403);
    });

    it('returns 200 with admin token', async () => {
      const token = createToken('ADMIN');
      const response = await request(app)
        .get('/api/notifications/admin/history')
        .set('Authorization', `Bearer ${token}`);
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });
});

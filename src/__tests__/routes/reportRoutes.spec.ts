import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import reportRoutes from '@/routes/reportRoutes';

jest.mock('@/controllers/reportController', () => ({
  __esModule: true,
  createReport: jest.fn((req, res) =>
    res.status(201).json({ success: true, data: { id: 'report-id' } })
  ),
  updateReport: jest.fn((req, res) =>
    res.status(200).json({ success: true, data: { id: req.params.id } })
  ),
  withdrawReport: jest.fn((req, res) =>
    res.status(200).json({ success: true, message: 'Đã rút lại báo cáo' })
  ),
  getMyReports: jest.fn((req, res) =>
    res.status(200).json({ success: true, data: [] })
  ),
  adminGetReports: jest.fn((req, res) =>
    res.status(200).json({ success: true, data: [] })
  ),
  adminGetReportDetail: jest.fn((req, res) =>
    res.status(200).json({ success: true, data: { id: req.params.id } })
  ),
  adminProcessReport: jest.fn((req, res) =>
    res.status(200).json({ success: true, data: {} })
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

const VALID_REPORT_BODY = {
  targetType: 'POST',
  targetId: '507f191e810c19729de860ea',
  reason: 'FOOD_SAFETY',
  description:
    'Thực phẩm này có dấu hiệu bị ôi thiu, không an toàn khi sử dụng.',
  images: ['https://example.com/evidence.jpg'],
};

describe('reportRoutes', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/reports', reportRoutes);

  // POST / — gửi báo cáo
  describe('POST /', () => {
    it('returns 401 without token', async () => {
      const response = await request(app)
        .post('/api/reports')
        .send(VALID_REPORT_BODY);
      expect(response.status).toBe(401);
    });

    it('returns 400 when body is missing required fields', async () => {
      const token = createToken('USER');
      const response = await request(app)
        .post('/api/reports')
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect(response.status).toBe(400);
    });

    it('returns 400 when description is too short', async () => {
      const token = createToken('USER');
      const response = await request(app)
        .post('/api/reports')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...VALID_REPORT_BODY, description: 'Short' });
      expect(response.status).toBe(400);
    });

    it('returns 400 when images array is empty', async () => {
      const token = createToken('USER');
      const response = await request(app)
        .post('/api/reports')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...VALID_REPORT_BODY, images: [] });
      expect(response.status).toBe(400);
    });

    it('returns 201 with valid token and body', async () => {
      const token = createToken('USER');
      const response = await request(app)
        .post('/api/reports')
        .set('Authorization', `Bearer ${token}`)
        .send(VALID_REPORT_BODY);
      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
    });
  });

  // GET /me — xem lịch sử báo cáo của mình
  describe('GET /me', () => {
    it('returns 401 without token', async () => {
      const response = await request(app).get('/api/reports/me');
      expect(response.status).toBe(401);
    });

    it('returns 200 with valid token', async () => {
      const token = createToken('USER');
      const response = await request(app)
        .get('/api/reports/me')
        .set('Authorization', `Bearer ${token}`);
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  // PUT /:id — chỉnh sửa báo cáo
  describe('PUT /:id', () => {
    it('returns 401 without token', async () => {
      const response = await request(app)
        .put('/api/reports/507f191e810c19729de860ea')
        .send({
          description:
            'Updated description with enough characters for validation.',
        });
      expect(response.status).toBe(401);
    });

    it('returns 200 with valid token and body', async () => {
      const token = createToken('USER');
      const response = await request(app)
        .put('/api/reports/507f191e810c19729de860ea')
        .set('Authorization', `Bearer ${token}`)
        .send({
          description: 'Updated: thực phẩm này có biểu hiện ôi thiu rõ ràng.',
        });
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  // DELETE /:id — rút lại báo cáo
  describe('DELETE /:id', () => {
    it('returns 401 without token', async () => {
      const response = await request(app).delete(
        '/api/reports/507f191e810c19729de860ea'
      );
      expect(response.status).toBe(401);
    });

    it('returns 200 with valid token', async () => {
      const token = createToken('USER');
      const response = await request(app)
        .delete('/api/reports/507f191e810c19729de860ea')
        .set('Authorization', `Bearer ${token}`);
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  // GET /admin — admin xem tất cả báo cáo
  describe('GET /admin', () => {
    it('returns 401 without token', async () => {
      const response = await request(app).get('/api/reports/admin');
      expect(response.status).toBe(401);
    });

    it('returns 403 with non-admin token', async () => {
      const token = createToken('USER');
      const response = await request(app)
        .get('/api/reports/admin')
        .set('Authorization', `Bearer ${token}`);
      expect(response.status).toBe(403);
    });

    it('returns 200 with admin token', async () => {
      const token = createToken('ADMIN');
      const response = await request(app)
        .get('/api/reports/admin')
        .set('Authorization', `Bearer ${token}`);
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  // GET /admin/:id — xem chi tiết báo cáo
  describe('GET /admin/:id', () => {
    it('returns 401 without token', async () => {
      const response = await request(app).get(
        '/api/reports/admin/507f191e810c19729de860ea'
      );
      expect(response.status).toBe(401);
    });

    it('returns 403 with non-admin token', async () => {
      const token = createToken('USER');
      const response = await request(app)
        .get('/api/reports/admin/507f191e810c19729de860ea')
        .set('Authorization', `Bearer ${token}`);
      expect(response.status).toBe(403);
    });

    it('returns 200 with admin token', async () => {
      const token = createToken('ADMIN');
      const response = await request(app)
        .get('/api/reports/admin/507f191e810c19729de860ea')
        .set('Authorization', `Bearer ${token}`);
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  // PUT /admin/:id/process — xử lý báo cáo
  describe('PUT /admin/:id/process', () => {
    it('returns 401 without token', async () => {
      const response = await request(app)
        .put('/api/reports/admin/507f191e810c19729de860ea/process')
        .send({ status: 'RESOLVED', resolutionNote: 'Đã xử lý vi phạm' });
      expect(response.status).toBe(401);
    });

    it('returns 403 with non-admin token', async () => {
      const token = createToken('USER');
      const response = await request(app)
        .put('/api/reports/admin/507f191e810c19729de860ea/process')
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'RESOLVED', resolutionNote: 'Đã xử lý vi phạm' });
      expect(response.status).toBe(403);
    });

    it('returns 400 when body is missing required fields', async () => {
      const token = createToken('ADMIN');
      const response = await request(app)
        .put('/api/reports/admin/507f191e810c19729de860ea/process')
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect(response.status).toBe(400);
    });

    it('returns 200 with valid admin token and body', async () => {
      const token = createToken('ADMIN');
      const response = await request(app)
        .put('/api/reports/admin/507f191e810c19729de860ea/process')
        .set('Authorization', `Bearer ${token}`)
        .send({
          status: 'RESOLVED',
          actionTaken: 'POST_HIDDEN',
          resolutionNote:
            'Bài đăng đã bị ẩn do vi phạm quy định an toàn thực phẩm.',
        });
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });
});

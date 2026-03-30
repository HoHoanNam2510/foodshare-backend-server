import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';

import reviewRoutes from '@/routes/reviewRoutes';

jest.mock('@/controllers/reviewController', () => ({
  __esModule: true,
  createReview: jest.fn((req, res) =>
    res.status(201).json({ success: true, data: { rating: req.body.rating } })
  ),
  getUserReviews: jest.fn((req, res) =>
    res.status(200).json({ success: true, data: [], params: req.params })
  ),
  getMyWrittenReviews: jest.fn((req, res) =>
    res.status(200).json({ success: true, data: [] })
  ),
  updateMyReview: jest.fn((req, res) =>
    res.status(200).json({ success: true, data: { id: req.params.reviewId } })
  ),
  deleteMyReview: jest.fn((req, res) =>
    res.status(200).json({ success: true, message: 'Xóa thành công' })
  ),
  adminGetReviews: jest.fn((req, res) =>
    res.status(200).json({ success: true, data: [], query: req.query })
  ),
  adminDeleteReview: jest.fn((req, res) =>
    res.status(200).json({ success: true, message: 'Admin đã xóa' })
  ),
}));

const JWT_SECRET = 'fallback_secret_key_for_dev';

function createToken(role: 'USER' | 'ADMIN'): string {
  return jwt.sign({ id: '507f191e810c19729de860ea', role }, JWT_SECRET, {
    expiresIn: '1h',
  });
}

describe('reviewRoutes auth/role/validation', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/reviews', reviewRoutes);

  // =============================================
  // POST /api/reviews — createReview
  // =============================================
  describe('POST /api/reviews', () => {
    it('returns 401 when missing token', async () => {
      const response = await request(app)
        .post('/api/reviews')
        .send({ transactionId: 'abc', rating: 5 });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('returns 400 when body validation fails (missing rating)', async () => {
      const token = createToken('USER');

      const response = await request(app)
        .post('/api/reviews')
        .set('Authorization', `Bearer ${token}`)
        .send({ transactionId: '507f191e810c19729de860ea' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('returns 400 when rating is out of range', async () => {
      const token = createToken('USER');

      const response = await request(app)
        .post('/api/reviews')
        .set('Authorization', `Bearer ${token}`)
        .send({ transactionId: '507f191e810c19729de860ea', rating: 6 });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('creates review with valid payload', async () => {
      const token = createToken('USER');

      const response = await request(app)
        .post('/api/reviews')
        .set('Authorization', `Bearer ${token}`)
        .send({
          transactionId: '507f191e810c19729de860ea',
          rating: 5,
          feedback: 'Rất tốt',
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
    });
  });

  // =============================================
  // GET /api/reviews/me — getMyWrittenReviews
  // =============================================
  describe('GET /api/reviews/me', () => {
    it('returns 401 when missing token', async () => {
      const response = await request(app).get('/api/reviews/me');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('returns 200 for authenticated user', async () => {
      const token = createToken('USER');

      const response = await request(app)
        .get('/api/reviews/me')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  // =============================================
  // GET /api/reviews/users/:userId — getUserReviews (public)
  // =============================================
  describe('GET /api/reviews/users/:userId', () => {
    it('returns 200 without auth (public endpoint)', async () => {
      const response = await request(app).get(
        '/api/reviews/users/507f191e810c19729de860ea'
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  // =============================================
  // PUT /api/reviews/:reviewId — updateMyReview
  // =============================================
  describe('PUT /api/reviews/:reviewId', () => {
    it('returns 401 when missing token', async () => {
      const response = await request(app)
        .put('/api/reviews/507f191e810c19729de860ea')
        .send({ rating: 4 });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('returns 400 when body validation fails (rating out of range)', async () => {
      const token = createToken('USER');

      const response = await request(app)
        .put('/api/reviews/507f191e810c19729de860ea')
        .set('Authorization', `Bearer ${token}`)
        .send({ rating: 0 });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('updates review with valid payload', async () => {
      const token = createToken('USER');

      const response = await request(app)
        .put('/api/reviews/507f191e810c19729de860ea')
        .set('Authorization', `Bearer ${token}`)
        .send({ rating: 4, feedback: 'Cập nhật' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  // =============================================
  // DELETE /api/reviews/:reviewId — deleteMyReview
  // =============================================
  describe('DELETE /api/reviews/:reviewId', () => {
    it('returns 401 when missing token', async () => {
      const response = await request(app).delete(
        '/api/reviews/507f191e810c19729de860ea'
      );

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('returns 200 for authenticated user', async () => {
      const token = createToken('USER');

      const response = await request(app)
        .delete('/api/reviews/507f191e810c19729de860ea')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  // =============================================
  // GET /api/reviews/admin — adminGetReviews
  // =============================================
  describe('GET /api/reviews/admin', () => {
    it('returns 401 when missing token', async () => {
      const response = await request(app).get('/api/reviews/admin');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('returns 403 when role is not admin', async () => {
      const token = createToken('USER');

      const response = await request(app)
        .get('/api/reviews/admin')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });

    it('returns 200 for admin', async () => {
      const token = createToken('ADMIN');

      const response = await request(app)
        .get('/api/reviews/admin')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  // =============================================
  // DELETE /api/reviews/admin/:reviewId — adminDeleteReview
  // =============================================
  describe('DELETE /api/reviews/admin/:reviewId', () => {
    it('returns 401 when missing token', async () => {
      const response = await request(app).delete(
        '/api/reviews/admin/507f191e810c19729de860ea'
      );

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('returns 403 when role is not admin', async () => {
      const token = createToken('USER');

      const response = await request(app)
        .delete('/api/reviews/admin/507f191e810c19729de860ea')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });

    it('returns 200 for admin', async () => {
      const token = createToken('ADMIN');

      const response = await request(app)
        .delete('/api/reviews/admin/507f191e810c19729de860ea')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });
});

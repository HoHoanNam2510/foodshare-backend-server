import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import greenPointRoutes from '@/routes/greenPointRoutes';

jest.mock('@/controllers/greenPointController', () => ({
  __esModule: true,
  getPointHistory: jest.fn((req, res) =>
    res.status(200).json({ success: true, data: [] })
  ),
  adminGetAllPointLogs: jest.fn((req, res) =>
    res.status(200).json({ success: true, data: [] })
  ),
  getLeaderboard: jest.fn((req, res) =>
    res.status(200).json({ success: true, data: [] })
  ),
  getMyRankingSummary: jest.fn((req, res) =>
    res.status(200).json({ success: true, data: {} })
  ),
}));

process.env.JWT_SECRET = 'test-secret';

function createToken(role: 'USER' | 'ADMIN'): string {
  return jwt.sign(
    { id: '507f191e810c19729de860ea', role },
    process.env.JWT_SECRET as string,
    { expiresIn: '1h' }
  );
}

describe('greenPointRoutes', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/greenpoints', greenPointRoutes);

  it('GET /history - returns 401 without token', async () => {
    const response = await request(app).get('/api/greenpoints/history');
    expect(response.status).toBe(401);
  });

  it('GET /history - returns 200 with valid token', async () => {
    const token = createToken('USER');
    const response = await request(app)
      .get('/api/greenpoints/history')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  it('GET /leaderboard - returns 200 without token (public)', async () => {
    const response = await request(app).get('/api/greenpoints/leaderboard');
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  it('GET /leaderboard - returns 200 with token', async () => {
    const token = createToken('USER');
    const response = await request(app)
      .get('/api/greenpoints/leaderboard')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  it('GET /ranking-summary - returns 401 without token', async () => {
    const response = await request(app).get('/api/greenpoints/ranking-summary');
    expect(response.status).toBe(401);
  });

  it('GET /ranking-summary - returns 200 with valid token', async () => {
    const token = createToken('USER');
    const response = await request(app)
      .get('/api/greenpoints/ranking-summary')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  it('GET /admin/logs - returns 401 without token', async () => {
    const response = await request(app).get('/api/greenpoints/admin/logs');
    expect(response.status).toBe(401);
  });

  it('GET /admin/logs - returns 403 without admin role', async () => {
    const token = createToken('USER');
    const response = await request(app)
      .get('/api/greenpoints/admin/logs')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(403);
  });

  it('GET /admin/logs - returns 200 with admin token', async () => {
    const token = createToken('ADMIN');
    const response = await request(app)
      .get('/api/greenpoints/admin/logs')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });
});

import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import statisticsRoutes from '@/routes/statisticsRoutes';

jest.mock('@/controllers/statisticsController', () => ({
  __esModule: true,
  getMyStatisticsController: jest.fn((req, res) =>
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

describe('statisticsRoutes', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/statistics', statisticsRoutes);

  it('GET /me - returns 401 without token', async () => {
    const response = await request(app).get('/api/statistics/me');
    expect(response.status).toBe(401);
  });

  it('GET /me - returns 400 without required range query param', async () => {
    const token = createToken('STORE');
    const response = await request(app)
      .get('/api/statistics/me')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(400);
  });

  it('GET /me - returns 200 with STORE token and valid range', async () => {
    const token = createToken('STORE');
    const response = await request(app)
      .get('/api/statistics/me?range=7d')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  it('GET /me - returns 200 with ADMIN token and valid range', async () => {
    const token = createToken('ADMIN');
    const response = await request(app)
      .get('/api/statistics/me?range=30d')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  it('GET /me - returns 200 with USER token and valid range', async () => {
    const token = createToken('USER');
    const response = await request(app)
      .get('/api/statistics/me?range=12m')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
  });
});

import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import dashboardRoutes from '@/routes/dashboardRoutes';

jest.mock('@/controllers/dashboardController', () => ({
  __esModule: true,
  dashboardStats: jest.fn((req, res) =>
    res.status(200).json({ success: true, data: {} })
  ),
  dashboardChart: jest.fn((req, res) =>
    res.status(200).json({ success: true, data: [] })
  ),
  dashboardTable: jest.fn((req, res) =>
    res.status(200).json({ success: true, data: [] })
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

describe('dashboardRoutes', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/dashboard', dashboardRoutes);

  it('GET /stats - returns 401 without token', async () => {
    const response = await request(app).get('/api/dashboard/stats');
    expect(response.status).toBe(401);
  });

  it('GET /stats - returns 403 without admin role', async () => {
    const token = createToken('USER');
    const response = await request(app)
      .get('/api/dashboard/stats')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(403);
  });

  it('GET /stats - returns 200 with admin token', async () => {
    const token = createToken('ADMIN');
    const response = await request(app)
      .get('/api/dashboard/stats')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  it('GET /chart - returns 401 without token', async () => {
    const response = await request(app).get('/api/dashboard/chart');
    expect(response.status).toBe(401);
  });

  it('GET /chart - returns 403 without admin role', async () => {
    const token = createToken('USER');
    const response = await request(app)
      .get('/api/dashboard/chart')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(403);
  });

  it('GET /chart - returns 200 with admin token', async () => {
    const token = createToken('ADMIN');
    const response = await request(app)
      .get('/api/dashboard/chart')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  it('GET /table - returns 401 without token', async () => {
    const response = await request(app).get('/api/dashboard/table');
    expect(response.status).toBe(401);
  });

  it('GET /table - returns 403 without admin role', async () => {
    const token = createToken('USER');
    const response = await request(app)
      .get('/api/dashboard/table')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(403);
  });

  it('GET /table - returns 200 with admin token', async () => {
    const token = createToken('ADMIN');
    const response = await request(app)
      .get('/api/dashboard/table')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });
});

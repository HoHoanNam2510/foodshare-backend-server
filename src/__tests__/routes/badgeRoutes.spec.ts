import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import badgeRoutes from '@/routes/badgeRoutes';

jest.mock('@/controllers/badgeController', () => ({
  __esModule: true,
  getBadgeCatalogHandler: jest.fn((req, res) =>
    res.status(200).json({ success: true, data: [] })
  ),
  getMyBadgesHandler: jest.fn((req, res) =>
    res.status(200).json({ success: true, data: [] })
  ),
  adminGetAllBadgesHandler: jest.fn((req, res) =>
    res.status(200).json({ success: true, data: [] })
  ),
  adminCreateBadgeHandler: jest.fn((req, res) =>
    res.status(201).json({ success: true, data: { id: 'badge-id' } })
  ),
  adminUpdateBadgeHandler: jest.fn((req, res) =>
    res.status(200).json({ success: true, data: { id: req.params.badgeId } })
  ),
  adminToggleBadgeHandler: jest.fn((req, res) =>
    res.status(200).json({ success: true, data: {} })
  ),
  adminGetBadgeStatsHandler: jest.fn((req, res) =>
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

describe('badgeRoutes', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/badges', badgeRoutes);

  it('GET /catalog - returns 401 without token', async () => {
    const response = await request(app).get('/api/badges/catalog');
    expect(response.status).toBe(401);
  });

  it('GET /catalog - returns 200 with valid token', async () => {
    const token = createToken('USER');
    const response = await request(app)
      .get('/api/badges/catalog')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  it('GET /my - returns 401 without token', async () => {
    const response = await request(app).get('/api/badges/my');
    expect(response.status).toBe(401);
  });

  it('GET /my - returns 200 with valid token', async () => {
    const token = createToken('USER');
    const response = await request(app)
      .get('/api/badges/my')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  it('GET /admin/stats - returns 401 without token', async () => {
    const response = await request(app).get('/api/badges/admin/stats');
    expect(response.status).toBe(401);
  });

  it('GET /admin/stats - returns 403 without admin role', async () => {
    const token = createToken('USER');
    const response = await request(app)
      .get('/api/badges/admin/stats')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(403);
  });

  it('GET /admin/stats - returns 200 with admin token', async () => {
    const token = createToken('ADMIN');
    const response = await request(app)
      .get('/api/badges/admin/stats')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  it('GET /admin - returns 401 without token', async () => {
    const response = await request(app).get('/api/badges/admin');
    expect(response.status).toBe(401);
  });

  it('GET /admin - returns 403 without admin role', async () => {
    const token = createToken('USER');
    const response = await request(app)
      .get('/api/badges/admin')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(403);
  });

  it('GET /admin - returns 200 with admin token', async () => {
    const token = createToken('ADMIN');
    const response = await request(app)
      .get('/api/badges/admin')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  it('POST /admin - returns 401 without token', async () => {
    const response = await request(app)
      .post('/api/badges/admin')
      .send({ name: 'Badge' });
    expect(response.status).toBe(401);
  });

  it('POST /admin - returns 403 without admin role', async () => {
    const token = createToken('USER');
    const response = await request(app)
      .post('/api/badges/admin')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Badge' });
    expect(response.status).toBe(403);
  });

  it('POST /admin - returns 400 on missing fields', async () => {
    const token = createToken('ADMIN');
    const response = await request(app)
      .post('/api/badges/admin')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(response.status).toBe(400);
  });

  it('POST /admin - returns 201 on success', async () => {
    const token = createToken('ADMIN');
    const response = await request(app)
      .post('/api/badges/admin')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: 'FIRST_POST',
        name: 'First Post',
        description: 'Create your first post',
        imageUrl: 'https://example.com/badge.png',
        targetRole: 'USER',
        triggerEvent: 'POST_CREATED',
        pointReward: 10,
      });
    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
  });

  it('PUT /admin/:badgeId - returns 401 without token', async () => {
    const response = await request(app)
      .put('/api/badges/admin/507f191e810c19729de860ea')
      .send({ name: 'Updated' });
    expect(response.status).toBe(401);
  });

  it('PUT /admin/:badgeId - returns 403 without admin role', async () => {
    const token = createToken('USER');
    const response = await request(app)
      .put('/api/badges/admin/507f191e810c19729de860ea')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Updated' });
    expect(response.status).toBe(403);
  });

  it('PUT /admin/:badgeId - returns 200 on success', async () => {
    const token = createToken('ADMIN');
    const response = await request(app)
      .put('/api/badges/admin/507f191e810c19729de860ea')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Updated Badge' });
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  it('PATCH /admin/:badgeId/toggle - returns 401 without token', async () => {
    const response = await request(app).patch(
      '/api/badges/admin/507f191e810c19729de860ea/toggle'
    );
    expect(response.status).toBe(401);
  });

  it('PATCH /admin/:badgeId/toggle - returns 403 without admin role', async () => {
    const token = createToken('USER');
    const response = await request(app)
      .patch('/api/badges/admin/507f191e810c19729de860ea/toggle')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(403);
  });

  it('PATCH /admin/:badgeId/toggle - returns 200 on success', async () => {
    const token = createToken('ADMIN');
    const response = await request(app)
      .patch('/api/badges/admin/507f191e810c19729de860ea/toggle')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });
});

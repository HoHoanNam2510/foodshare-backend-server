import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import categoryRoutes from '@/routes/categoryRoutes';

jest.mock('@/controllers/categoryController', () => ({
  __esModule: true,
  getActiveCategoriesHandler: jest.fn((req, res) =>
    res.status(200).json({ success: true, data: [] })
  ),
  adminGetAllCategoriesHandler: jest.fn((req, res) =>
    res.status(200).json({ success: true, data: [] })
  ),
  adminCreateCategoryHandler: jest.fn((req, res) =>
    res.status(201).json({ success: true, data: { id: 'category-id' } })
  ),
  adminUpdateCategoryHandler: jest.fn((req, res) =>
    res.status(200).json({ success: true, data: { id: req.params.categoryId } })
  ),
  adminDeleteCategoryHandler: jest.fn((req, res) =>
    res.status(200).json({ success: true, message: 'Deleted' })
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

describe('categoryRoutes', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/categories', categoryRoutes);

  it('GET / - returns 200 without token (public)', async () => {
    const response = await request(app).get('/api/categories');
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  it('GET / - returns 200 with token', async () => {
    const token = createToken('USER');
    const response = await request(app)
      .get('/api/categories')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  it('GET /admin - returns 401 without token', async () => {
    const response = await request(app).get('/api/categories/admin');
    expect(response.status).toBe(401);
  });

  it('GET /admin - returns 403 without admin role', async () => {
    const token = createToken('USER');
    const response = await request(app)
      .get('/api/categories/admin')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(403);
  });

  it('GET /admin - returns 200 with admin token', async () => {
    const token = createToken('ADMIN');
    const response = await request(app)
      .get('/api/categories/admin')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  it('POST /admin - returns 401 without token', async () => {
    const response = await request(app)
      .post('/api/categories/admin')
      .send({ name: 'Category' });
    expect(response.status).toBe(401);
  });

  it('POST /admin - returns 403 without admin role', async () => {
    const token = createToken('USER');
    const response = await request(app)
      .post('/api/categories/admin')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Category' });
    expect(response.status).toBe(403);
  });

  it('POST /admin - returns 400 on missing fields', async () => {
    const token = createToken('ADMIN');
    const response = await request(app)
      .post('/api/categories/admin')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(response.status).toBe(400);
  });

  it('POST /admin - returns 201 on success', async () => {
    const token = createToken('ADMIN');
    const response = await request(app)
      .post('/api/categories/admin')
      .set('Authorization', `Bearer ${token}`)
      .send({
        slug: 'vegetables',
        name: 'Vegetables',
        color: '#2E7D32',
        applyTo: 'P2P_FREE',
      });
    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
  });

  it('PUT /admin/:categoryId - returns 401 without token', async () => {
    const response = await request(app)
      .put('/api/categories/admin/507f191e810c19729de860ea')
      .send({ name: 'Updated' });
    expect(response.status).toBe(401);
  });

  it('PUT /admin/:categoryId - returns 403 without admin role', async () => {
    const token = createToken('USER');
    const response = await request(app)
      .put('/api/categories/admin/507f191e810c19729de860ea')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Updated' });
    expect(response.status).toBe(403);
  });

  it('PUT /admin/:categoryId - returns 200 on success', async () => {
    const token = createToken('ADMIN');
    const response = await request(app)
      .put('/api/categories/admin/507f191e810c19729de860ea')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Updated Category' });
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  it('DELETE /admin/:categoryId - returns 401 without token', async () => {
    const response = await request(app).delete(
      '/api/categories/admin/507f191e810c19729de860ea'
    );
    expect(response.status).toBe(401);
  });

  it('DELETE /admin/:categoryId - returns 403 without admin role', async () => {
    const token = createToken('USER');
    const response = await request(app)
      .delete('/api/categories/admin/507f191e810c19729de860ea')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(403);
  });

  it('DELETE /admin/:categoryId - returns 200 on success', async () => {
    const token = createToken('ADMIN');
    const response = await request(app)
      .delete('/api/categories/admin/507f191e810c19729de860ea')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });
});

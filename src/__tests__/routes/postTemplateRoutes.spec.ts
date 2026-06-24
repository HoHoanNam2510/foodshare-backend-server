import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import postTemplateRoutes from '@/routes/postTemplateRoutes';

jest.mock('@/controllers/postTemplateController', () => ({
  __esModule: true,
  getMyTemplatesHandler: jest.fn((req, res) =>
    res.status(200).json({ success: true, data: [] })
  ),
  createTemplateHandler: jest.fn((req, res) =>
    res.status(201).json({ success: true, data: { id: 'template-id' } })
  ),
  updateTemplateHandler: jest.fn((req, res) =>
    res.status(200).json({ success: true, data: { id: req.params.id } })
  ),
  deleteTemplateHandler: jest.fn((req, res) =>
    res.status(200).json({ success: true, message: 'Deleted' })
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

describe('postTemplateRoutes', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/post-templates', postTemplateRoutes);

  it('GET / - returns 401 without token', async () => {
    const response = await request(app).get('/api/post-templates');
    expect(response.status).toBe(401);
  });

  it('GET / - returns 200 with valid token', async () => {
    const token = createToken('USER');
    const response = await request(app)
      .get('/api/post-templates')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  it('POST / - returns 401 without token', async () => {
    const response = await request(app)
      .post('/api/post-templates')
      .send({ title: 'Template' });
    expect(response.status).toBe(401);
  });

  it('POST / - returns 400 on missing required fields', async () => {
    const token = createToken('USER');
    const response = await request(app)
      .post('/api/post-templates')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(response.status).toBe(400);
  });

  it('POST / - returns 201 on success', async () => {
    const token = createToken('USER');
    const response = await request(app)
      .post('/api/post-templates')
      .set('Authorization', `Bearer ${token}`)
      .send({
        templateName: 'My Reusable Template',
        type: 'P2P_FREE',
        category: '507f191e810c19729de860ea',
        title: 'Fresh Vegetables from Garden',
        description: 'Sharing fresh vegetables',
        totalQuantity: 5,
        price: 0,
      });
    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
  });

  it('PUT /:id - returns 401 without token', async () => {
    const response = await request(app)
      .put('/api/post-templates/507f191e810c19729de860ea')
      .send({ title: 'Updated' });
    expect(response.status).toBe(401);
  });

  it('PUT /:id - returns 200 on success', async () => {
    const token = createToken('USER');
    const response = await request(app)
      .put('/api/post-templates/507f191e810c19729de860ea')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Updated Title' });
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  it('DELETE /:id - returns 401 without token', async () => {
    const response = await request(app).delete(
      '/api/post-templates/507f191e810c19729de860ea'
    );
    expect(response.status).toBe(401);
  });

  it('DELETE /:id - returns 200 on success', async () => {
    const token = createToken('USER');
    const response = await request(app)
      .delete('/api/post-templates/507f191e810c19729de860ea')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });
});

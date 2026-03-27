import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';

import userRoutes from '@/routes/userRoutes';

jest.mock('@/controllers/userController', () => ({
  __esModule: true,
  createUser: jest.fn((req, res) =>
    res.status(201).json({ success: true, data: { email: req.body.email } })
  ),
  getUsers: jest.fn((req, res) =>
    res.status(200).json({ success: true, data: [], query: req.query })
  ),
  getUserById: jest.fn((req, res) =>
    res.status(200).json({ success: true, data: { id: req.params.id } })
  ),
  updateUser: jest.fn((req, res) =>
    res.status(200).json({ success: true, data: { id: req.params.id } })
  ),
  deleteUser: jest.fn((req, res) =>
    res.status(200).json({ success: true, data: { id: req.params.id } })
  ),
}));

const JWT_SECRET = 'fallback_secret_key_for_dev';

function createToken(role: 'USER' | 'ADMIN'): string {
  return jwt.sign({ id: '507f191e810c19729de860ea', role }, JWT_SECRET, {
    expiresIn: '1h',
  });
}

describe('userRoutes auth/role/validation', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/users', userRoutes);

  it('returns 401 when missing token', async () => {
    const response = await request(app).get('/api/users');

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
  });

  it('returns 403 when role is not admin', async () => {
    const token = createToken('USER');

    const response = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
  });

  it('allows admin to access user list', async () => {
    const token = createToken('ADMIN');

    const response = await request(app)
      .get('/api/users?page=1&limit=20')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  it('returns 400 when query is invalid', async () => {
    const token = createToken('ADMIN');

    const response = await request(app)
      .get('/api/users?page=-1')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });

  it('returns 400 when id param is invalid', async () => {
    const token = createToken('ADMIN');

    const response = await request(app)
      .put('/api/users/invalid-id')
      .set('Authorization', `Bearer ${token}`)
      .send({ fullName: 'Updated User' });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });

  it('creates user with valid payload', async () => {
    const token = createToken('ADMIN');

    const response = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        email: 'admin.create@example.com',
        password: 'secret123',
        fullName: 'Admin Create',
        authProvider: 'LOCAL',
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
  });
});

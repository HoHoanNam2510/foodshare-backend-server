import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import feedbackRoutes from '@/routes/feedbackRoutes';

jest.mock('@/controllers/feedbackController', () => ({
  __esModule: true,
  createFeedback: jest.fn((req, res) =>
    res.status(201).json({ success: true, data: { id: 'feedback-id' } })
  ),
  getMyFeedbacks: jest.fn((req, res) =>
    res.status(200).json({ success: true, data: [] })
  ),
  adminGetFeedbacks: jest.fn((req, res) =>
    res.status(200).json({ success: true, data: [] })
  ),
  adminGetFeedbackDetail: jest.fn((req, res) =>
    res.status(200).json({ success: true, data: { id: req.params.id } })
  ),
  adminAssignFeedback: jest.fn((req, res) =>
    res.status(200).json({ success: true, data: {} })
  ),
  adminResolveFeedback: jest.fn((req, res) =>
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

describe('feedbackRoutes', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/feedbacks', feedbackRoutes);

  it('POST / - returns 401 without token', async () => {
    const response = await request(app)
      .post('/api/feedbacks')
      .send({ transactionId: '507f191e810c19729de860ea', feedback: 'Good' });
    expect(response.status).toBe(401);
  });

  it('POST / - returns 400 on missing fields', async () => {
    const token = createToken('USER');
    const response = await request(app)
      .post('/api/feedbacks')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(response.status).toBe(400);
  });

  it('POST / - returns 201 on success', async () => {
    const token = createToken('USER');
    const response = await request(app)
      .post('/api/feedbacks')
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'BUG_REPORT',
        title: 'App crashes on load',
        content:
          'The application crashes when I try to open the food listing screen.',
      });
    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
  });

  it('GET /me - returns 401 without token', async () => {
    const response = await request(app).get('/api/feedbacks/me');
    expect(response.status).toBe(401);
  });

  it('GET /me - returns 200 with valid token', async () => {
    const token = createToken('USER');
    const response = await request(app)
      .get('/api/feedbacks/me')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  it('GET /admin - returns 401 without token', async () => {
    const response = await request(app).get('/api/feedbacks/admin');
    expect(response.status).toBe(401);
  });

  it('GET /admin - returns 403 without admin role', async () => {
    const token = createToken('USER');
    const response = await request(app)
      .get('/api/feedbacks/admin')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(403);
  });

  it('GET /admin - returns 200 with admin token', async () => {
    const token = createToken('ADMIN');
    const response = await request(app)
      .get('/api/feedbacks/admin')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  it('GET /admin/:id - returns 401 without token', async () => {
    const response = await request(app).get(
      '/api/feedbacks/admin/507f191e810c19729de860ea'
    );
    expect(response.status).toBe(401);
  });

  it('GET /admin/:id - returns 403 without admin role', async () => {
    const token = createToken('USER');
    const response = await request(app)
      .get('/api/feedbacks/admin/507f191e810c19729de860ea')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(403);
  });

  it('GET /admin/:id - returns 200 with admin token', async () => {
    const token = createToken('ADMIN');
    const response = await request(app)
      .get('/api/feedbacks/admin/507f191e810c19729de860ea')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  it('PATCH /admin/:id/assign - returns 401 without token', async () => {
    const response = await request(app)
      .patch('/api/feedbacks/admin/507f191e810c19729de860ea/assign')
      .send({ assignedTo: 'staff-id' });
    expect(response.status).toBe(401);
  });

  it('PATCH /admin/:id/assign - returns 403 without admin role', async () => {
    const token = createToken('USER');
    const response = await request(app)
      .patch('/api/feedbacks/admin/507f191e810c19729de860ea/assign')
      .set('Authorization', `Bearer ${token}`)
      .send({ assignedTo: 'staff-id' });
    expect(response.status).toBe(403);
  });

  it('PATCH /admin/:id/resolve - returns 401 without token', async () => {
    const response = await request(app)
      .patch('/api/feedbacks/admin/507f191e810c19729de860ea/resolve')
      .send({ resolution: 'RESOLVED' });
    expect(response.status).toBe(401);
  });

  it('PATCH /admin/:id/resolve - returns 403 without admin role', async () => {
    const token = createToken('USER');
    const response = await request(app)
      .patch('/api/feedbacks/admin/507f191e810c19729de860ea/resolve')
      .set('Authorization', `Bearer ${token}`)
      .send({ resolution: 'RESOLVED' });
    expect(response.status).toBe(403);
  });

  it('PATCH /admin/:id/resolve - returns 200 with admin token', async () => {
    const token = createToken('ADMIN');
    const response = await request(app)
      .patch('/api/feedbacks/admin/507f191e810c19729de860ea/resolve')
      .set('Authorization', `Bearer ${token}`)
      .send({
        adminReply:
          'Thank you for your report. We have resolved this issue in our latest update.',
      });
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });
});

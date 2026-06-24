import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import configRoutes from '@/routes/configRoutes';

jest.mock('@/models/SystemConfig', () => ({
  __esModule: true,
  default: {
    findOne: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue({ id: 'config-id' }),
    }),
    findOneAndUpdate: jest.fn().mockResolvedValue({ id: 'config-id' }),
  },
}));

jest.mock('@/models/AIPostModerationLog', () => ({
  __esModule: true,
  default: {
    find: jest.fn().mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([]),
    }),
    countDocuments: jest.fn().mockResolvedValue(0),
  },
}));

jest.mock('@/services/postService', () => ({
  __esModule: true,
  runAIBatchModerationJob: jest.fn().mockResolvedValue({ processed: 0 }),
}));

process.env.JWT_SECRET = 'test-secret';

function createToken(role: 'ADMIN'): string {
  return jwt.sign(
    { id: '507f191e810c19729de860ea', role },
    process.env.JWT_SECRET as string,
    { expiresIn: '1h' }
  );
}

describe('configRoutes', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/config', configRoutes);

  it('GET / - returns 401 without token', async () => {
    const response = await request(app).get('/api/config');
    expect(response.status).toBe(401);
  });

  it('GET / - returns 403 without admin role', async () => {
    const token = jwt.sign(
      { id: '507f191e810c19729de860ea', role: 'USER' },
      process.env.JWT_SECRET as string,
      { expiresIn: '1h' }
    );
    const response = await request(app)
      .get('/api/config')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(403);
  });

  it('GET / - returns 200 with admin token', async () => {
    const token = createToken('ADMIN');
    const response = await request(app)
      .get('/api/config')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  it('PUT / - returns 401 without token', async () => {
    const response = await request(app).put('/api/config').send({
      systemBankName: 'MB Bank',
      systemBankCode: 'MBB',
      systemBankAccountNumber: '123456789',
      systemBankAccountName: 'FoodShare',
    });
    expect(response.status).toBe(401);
  });

  it('PUT / - returns 403 without admin role', async () => {
    const token = jwt.sign(
      { id: '507f191e810c19729de860ea', role: 'USER' },
      process.env.JWT_SECRET as string,
      { expiresIn: '1h' }
    );
    const response = await request(app)
      .put('/api/config')
      .set('Authorization', `Bearer ${token}`)
      .send({
        systemBankName: 'MB Bank',
      });
    expect(response.status).toBe(403);
  });

  it('PATCH /soft-delete - returns 401 without token', async () => {
    const response = await request(app)
      .patch('/api/config/soft-delete')
      .send({ softDelete: { gracePeriodDays: 7 } });
    expect(response.status).toBe(401);
  });

  it('PATCH /soft-delete - returns 403 without admin role', async () => {
    const token = jwt.sign(
      { id: '507f191e810c19729de860ea', role: 'USER' },
      process.env.JWT_SECRET as string,
      { expiresIn: '1h' }
    );
    const response = await request(app)
      .patch('/api/config/soft-delete')
      .set('Authorization', `Bearer ${token}`)
      .send({ softDelete: { gracePeriodDays: 7 } });
    expect(response.status).toBe(403);
  });

  it('PUT /ai-moderation - returns 401 without token', async () => {
    const response = await request(app)
      .put('/api/config/ai-moderation')
      .send({
        enabled: true,
        intervalHours: 6,
        trustScoreThresholds: { approve: 0.7, reject: 0.3 },
      });
    expect(response.status).toBe(401);
  });

  it('PUT /ai-moderation - returns 403 without admin role', async () => {
    const token = jwt.sign(
      { id: '507f191e810c19729de860ea', role: 'USER' },
      process.env.JWT_SECRET as string,
      { expiresIn: '1h' }
    );
    const response = await request(app)
      .put('/api/config/ai-moderation')
      .set('Authorization', `Bearer ${token}`)
      .send({
        enabled: true,
      });
    expect(response.status).toBe(403);
  });

  it('POST /ai-moderation/run - returns 401 without token', async () => {
    const response = await request(app).post('/api/config/ai-moderation/run');
    expect(response.status).toBe(401);
  });

  it('POST /ai-moderation/run - returns 403 without admin role', async () => {
    const token = jwt.sign(
      { id: '507f191e810c19729de860ea', role: 'USER' },
      process.env.JWT_SECRET as string,
      { expiresIn: '1h' }
    );
    const response = await request(app)
      .post('/api/config/ai-moderation/run')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(403);
  });

  it('GET /ai-moderation/logs - returns 401 without token', async () => {
    const response = await request(app).get('/api/config/ai-moderation/logs');
    expect(response.status).toBe(401);
  });

  it('GET /ai-moderation/logs - returns 403 without admin role', async () => {
    const token = jwt.sign(
      { id: '507f191e810c19729de860ea', role: 'USER' },
      process.env.JWT_SECRET as string,
      { expiresIn: '1h' }
    );
    const response = await request(app)
      .get('/api/config/ai-moderation/logs')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(403);
  });

  it('GET /ai-moderation/logs - returns 200 with admin token', async () => {
    const token = createToken('ADMIN');
    const response = await request(app)
      .get('/api/config/ai-moderation/logs')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });
});

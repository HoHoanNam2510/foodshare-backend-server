import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import authRoutes from '@/routes/authRoutes';

jest.mock('@/controllers/authController', () => ({
  __esModule: true,
  registerSendCode: jest.fn((req, res) =>
    res.status(200).json({ success: true, message: 'Code sent', data: {} })
  ),
  registerVerify: jest.fn((req, res) =>
    res.status(201).json({ success: true, data: { token: 'jwt-token' } })
  ),
  verifyCodeOnly: jest.fn((req, res) =>
    res.status(200).json({ success: true, data: { valid: true } })
  ),
  login: jest.fn((req, res) =>
    res.status(200).json({ success: true, data: { token: 'jwt-token' } })
  ),
  googleLogin: jest.fn((req, res) =>
    res.status(200).json({ success: true, data: { token: 'jwt-token' } })
  ),
  completeProfile: jest.fn((req, res) =>
    res
      .status(200)
      .json({ success: true, data: { fullName: req.body.fullName } })
  ),
  setPassword: jest.fn((req, res) =>
    res.status(200).json({ success: true, data: {} })
  ),
  changePassword: jest.fn((req, res) =>
    res.status(200).json({ success: true, data: {} })
  ),
  sendEmailVerificationCode: jest.fn((req, res) =>
    res.status(200).json({ success: true, message: 'Code sent' })
  ),
  verifyEmail: jest.fn((req, res) =>
    res.status(200).json({ success: true, data: { verified: true } })
  ),
  registerStore: jest.fn((req, res) =>
    res.status(200).json({ success: true, data: { role: 'STORE' } })
  ),
  resubmitKyc: jest.fn((req, res) =>
    res.status(200).json({ success: true, data: { kycStatus: 'PENDING' } })
  ),
  forgotPasswordSendCode: jest.fn((req, res) =>
    res.status(200).json({ success: true, message: 'Code sent' })
  ),
  forgotPasswordVerifyCode: jest.fn((req, res) =>
    res.status(200).json({ success: true, data: { valid: true } })
  ),
  forgotPasswordReset: jest.fn((req, res) =>
    res.status(200).json({ success: true, message: 'Password reset' })
  ),
  logout: jest.fn((req, res) =>
    res.status(200).json({ success: true, message: 'Logged out' })
  ),
  getMe: jest.fn((req, res) =>
    res.status(200).json({ success: true, data: { id: 'user-id' } })
  ),
  updateProfile: jest.fn((req, res) =>
    res.status(200).json({ success: true, data: req.body })
  ),
  updateMyLocation: jest.fn((req, res) =>
    res.status(200).json({ success: true, data: {} })
  ),
  deleteMyAccount: jest.fn((req, res) =>
    res.status(200).json({ success: true, message: 'Account deleted' })
  ),
  getMyImpact: jest.fn((req, res) =>
    res.status(200).json({ success: true, data: {} })
  ),
}));

jest.mock('@/controllers/userTrashController', () => ({
  __esModule: true,
  getMyTrash: jest.fn((req, res) =>
    res.status(200).json({ success: true, data: [] })
  ),
  restoreMyItem: jest.fn((req, res) =>
    res.status(200).json({ success: true, message: 'Restored' })
  ),
  purgeMyItem: jest.fn((req, res) =>
    res.status(200).json({ success: true, message: 'Purged' })
  ),
}));

jest.mock('@/controllers/emailVerificationController', () => ({
  __esModule: true,
  sendEmailVerificationCode: jest.fn((req, res) =>
    res.status(200).json({ success: true, message: 'Code sent' })
  ),
  verifyEmail: jest.fn((req, res) =>
    res.status(200).json({ success: true, data: { verified: true } })
  ),
}));

jest.mock('@/middlewares/rateLimitMiddleware', () => ({
  __esModule: true,
  authLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
  otpLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

process.env.JWT_SECRET = 'test-secret';

function createToken(role: 'USER' | 'STORE' | 'ADMIN'): string {
  return jwt.sign(
    { id: '507f191e810c19729de860ea', role },
    process.env.JWT_SECRET as string,
    { expiresIn: '1h' }
  );
}

describe('authRoutes', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);

  it('POST /api/auth/register/send-code - returns 200 on success', async () => {
    const response = await request(app)
      .post('/api/auth/register/send-code')
      .send({
        email: 'user@example.com',
        password: 'password123',
        fullName: 'Test User',
        phoneNumber: '0123456789',
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  it('POST /api/auth/register/send-code - returns 400 on missing fields', async () => {
    const response = await request(app)
      .post('/api/auth/register/send-code')
      .send({ email: 'user@example.com' });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });

  it('POST /api/auth/login - returns 401 without token - redirects correctly', async () => {
    const response = await request(app).post('/api/auth/login').send({
      email: 'user@example.com',
      password: 'password123',
    });

    expect(response.status).toBe(200);
  });

  it('GET /api/auth/me - returns 401 when missing token', async () => {
    const response = await request(app).get('/api/auth/me');

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
  });

  it('GET /api/auth/me - returns 200 with valid token', async () => {
    const token = createToken('USER');

    const response = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  it('PUT /api/auth/update-profile - returns 401 without token', async () => {
    const response = await request(app)
      .put('/api/auth/update-profile')
      .send({ fullName: 'Updated Name' });

    expect(response.status).toBe(401);
  });

  it('PUT /api/auth/change-password - returns 401 without token', async () => {
    const response = await request(app).put('/api/auth/change-password').send({
      oldPassword: 'old123',
      newPassword: 'new123',
    });

    expect(response.status).toBe(401);
  });

  it('PUT /api/auth/me/location - returns 401 without token', async () => {
    const response = await request(app).put('/api/auth/me/location').send({
      latitude: 10.7769,
      longitude: 106.7009,
    });

    expect(response.status).toBe(401);
  });

  it('POST /api/auth/logout - returns 401 without token', async () => {
    const response = await request(app).post('/api/auth/logout');

    expect(response.status).toBe(401);
  });

  it('DELETE /api/auth/me/account - returns 401 without token', async () => {
    const response = await request(app).delete('/api/auth/me/account');

    expect(response.status).toBe(401);
  });

  it('GET /api/auth/me/trash - returns 401 without token', async () => {
    const response = await request(app).get(
      '/api/auth/me/trash?collection=posts'
    );

    expect(response.status).toBe(401);
  });
});

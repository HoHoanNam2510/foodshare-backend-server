import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import voucherRoutes from '@/routes/voucherRoutes';

jest.mock('@/controllers/voucherController', () => ({
  __esModule: true,
  storeCreateVoucher: jest.fn((req, res) =>
    res.status(201).json({ success: true, data: { id: 'voucher-id' } })
  ),
  storeUpdateVoucher: jest.fn((req, res) =>
    res.status(200).json({ success: true, data: { id: req.params.id } })
  ),
  storeToggleVoucher: jest.fn((req, res) =>
    res.status(200).json({ success: true, data: {} })
  ),
  storeGetMyVouchers: jest.fn((req, res) =>
    res.status(200).json({ success: true, data: [] })
  ),
  storeDeleteVoucher: jest.fn((req, res) =>
    res.status(200).json({ success: true, message: 'Đã xóa voucher' })
  ),
  getVoucherMarket: jest.fn((req, res) =>
    res.status(200).json({ success: true, data: [] })
  ),
  redeemVoucher: jest.fn((req, res) =>
    res.status(200).json({ success: true, message: 'Đổi voucher thành công' })
  ),
  getMyVouchers: jest.fn((req, res) =>
    res.status(200).json({ success: true, data: [] })
  ),
  getApplicableVouchersForPost: jest.fn((req, res) =>
    res.status(200).json({ success: true, data: [] })
  ),
  adminGetVouchers: jest.fn((req, res) =>
    res.status(200).json({ success: true, data: [] })
  ),
  adminToggleVoucher: jest.fn((req, res) =>
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

const VALID_VOUCHER_BODY = {
  code: 'SAVE10',
  title: 'Giảm 10% cho đơn hàng đầu tiên',
  discountType: 'PERCENTAGE',
  discountValue: 10,
  pointCost: 50,
  totalQuantity: 100,
  validFrom: new Date(Date.now() - 86400000).toISOString(),
  validUntil: new Date(Date.now() + 7 * 86400000).toISOString(),
};

describe('voucherRoutes', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/vouchers', voucherRoutes);

  // GET /market — xem chợ voucher (public)
  describe('GET /market', () => {
    it('returns 200 without token (public)', async () => {
      const response = await request(app).get('/api/vouchers/market');
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  // GET /me — xem ví voucher của mình
  describe('GET /me', () => {
    it('returns 401 without token', async () => {
      const response = await request(app).get('/api/vouchers/me');
      expect(response.status).toBe(401);
    });

    it('returns 200 with valid USER token', async () => {
      const token = createToken('USER');
      const response = await request(app)
        .get('/api/vouchers/me')
        .set('Authorization', `Bearer ${token}`);
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  // POST /:id/redeem — đổi điểm lấy voucher
  describe('POST /:id/redeem', () => {
    it('returns 401 without token', async () => {
      const response = await request(app).post(
        '/api/vouchers/507f191e810c19729de860ea/redeem'
      );
      expect(response.status).toBe(401);
    });

    it('returns 200 with valid USER token', async () => {
      const token = createToken('USER');
      const response = await request(app)
        .post('/api/vouchers/507f191e810c19729de860ea/redeem')
        .set('Authorization', `Bearer ${token}`);
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  // GET /store/mine — cửa hàng xem voucher của mình
  describe('GET /store/mine', () => {
    it('returns 401 without token', async () => {
      const response = await request(app).get('/api/vouchers/store/mine');
      expect(response.status).toBe(401);
    });

    it('returns 200 with valid STORE token', async () => {
      const token = createToken('STORE');
      const response = await request(app)
        .get('/api/vouchers/store/mine')
        .set('Authorization', `Bearer ${token}`);
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  // POST / — cửa hàng tạo voucher
  describe('POST /', () => {
    it('returns 401 without token', async () => {
      const response = await request(app)
        .post('/api/vouchers')
        .send(VALID_VOUCHER_BODY);
      expect(response.status).toBe(401);
    });

    it('returns 400 when body is missing required fields', async () => {
      const token = createToken('STORE');
      const response = await request(app)
        .post('/api/vouchers')
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect(response.status).toBe(400);
    });

    it('returns 400 when discountValue > 100 for PERCENTAGE type', async () => {
      const token = createToken('STORE');
      const response = await request(app)
        .post('/api/vouchers')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...VALID_VOUCHER_BODY, discountValue: 150 });
      expect(response.status).toBe(400);
    });

    it('returns 201 with valid STORE token and body', async () => {
      const token = createToken('STORE');
      const response = await request(app)
        .post('/api/vouchers')
        .set('Authorization', `Bearer ${token}`)
        .send(VALID_VOUCHER_BODY);
      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
    });
  });

  // PUT /:id — cửa hàng cập nhật voucher
  describe('PUT /:id', () => {
    it('returns 401 without token', async () => {
      const response = await request(app)
        .put('/api/vouchers/507f191e810c19729de860ea')
        .send({ title: 'Updated Voucher' });
      expect(response.status).toBe(401);
    });

    it('returns 200 with valid STORE token', async () => {
      const token = createToken('STORE');
      const response = await request(app)
        .put('/api/vouchers/507f191e810c19729de860ea')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Updated Voucher Title' });
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  // PATCH /:id/toggle — cửa hàng bật/tắt voucher
  describe('PATCH /:id/toggle', () => {
    it('returns 401 without token', async () => {
      const response = await request(app).patch(
        '/api/vouchers/507f191e810c19729de860ea/toggle'
      );
      expect(response.status).toBe(401);
    });

    it('returns 200 with valid STORE token', async () => {
      const token = createToken('STORE');
      const response = await request(app)
        .patch('/api/vouchers/507f191e810c19729de860ea/toggle')
        .set('Authorization', `Bearer ${token}`);
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  // DELETE /:id — cửa hàng xóa voucher
  describe('DELETE /:id', () => {
    it('returns 401 without token', async () => {
      const response = await request(app).delete(
        '/api/vouchers/507f191e810c19729de860ea'
      );
      expect(response.status).toBe(401);
    });

    it('returns 200 with valid STORE token', async () => {
      const token = createToken('STORE');
      const response = await request(app)
        .delete('/api/vouchers/507f191e810c19729de860ea')
        .set('Authorization', `Bearer ${token}`);
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  // GET /admin — admin xem tất cả voucher
  describe('GET /admin', () => {
    it('returns 401 without token', async () => {
      const response = await request(app).get('/api/vouchers/admin');
      expect(response.status).toBe(401);
    });

    it('returns 403 with non-admin token', async () => {
      const token = createToken('USER');
      const response = await request(app)
        .get('/api/vouchers/admin')
        .set('Authorization', `Bearer ${token}`);
      expect(response.status).toBe(403);
    });

    it('returns 200 with admin token', async () => {
      const token = createToken('ADMIN');
      const response = await request(app)
        .get('/api/vouchers/admin')
        .set('Authorization', `Bearer ${token}`);
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  // PATCH /admin/:id/toggle — admin bật/tắt voucher
  describe('PATCH /admin/:id/toggle', () => {
    it('returns 401 without token', async () => {
      const response = await request(app).patch(
        '/api/vouchers/admin/507f191e810c19729de860ea/toggle'
      );
      expect(response.status).toBe(401);
    });

    it('returns 403 with non-admin token', async () => {
      const token = createToken('USER');
      const response = await request(app)
        .patch('/api/vouchers/admin/507f191e810c19729de860ea/toggle')
        .set('Authorization', `Bearer ${token}`);
      expect(response.status).toBe(403);
    });

    it('returns 200 with admin token', async () => {
      const token = createToken('ADMIN');
      const response = await request(app)
        .patch('/api/vouchers/admin/507f191e810c19729de860ea/toggle')
        .set('Authorization', `Bearer ${token}`);
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });
});

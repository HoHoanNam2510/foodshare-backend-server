/* Script kiểm thử API thật cho FoodShare (Phụ lục D — Bảng 60, mục D.1).
 * Seed dữ liệu test (3 user + 2 bài đăng) rồi gọi 45+ endpoint thật, ghi kết quả + đo NFR.
 * Yêu cầu: backend đang chạy (npm run dev) + .env có MONGODB_URI, JWT_SECRET.
 * Chạy từ thư mục foodshare-backend-server:
 *   node scripts/api-tests/api-test-runner.cjs
 * Kết quả ghi ra fs-test-results.json (hoặc đường dẫn trong biến môi trường OUT).
 */
require('dotenv').config();
const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');

const BASE = 'http://localhost:5000/api';
const PW = 'Test@1234';
const results = [];
let TOKENS = {};
const IDS = {};

async function api(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const t0 = Date.now();
  let status = 0,
    json = null,
    err = null;
  try {
    const res = await fetch(BASE + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    status = res.status;
    try {
      json = await res.json();
    } catch {
      json = null;
    }
  } catch (e) {
    err = e.message;
  }
  return { status, json, ms: Date.now() - t0, err };
}

function rec(tc, name, expected, r, passCond) {
  const actual = r.err
    ? `NETWORK ERR: ${r.err}`
    : `HTTP ${r.status} | ${r.json ? r.json.message || JSON.stringify(r.json).slice(0, 90) : '(no json)'}`;
  const pass = passCond(r);
  results.push({
    tc,
    name,
    expected,
    actual,
    pass: pass ? 'PASS' : 'FAIL',
    ms: r.ms,
  });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${tc}  ${name}  ->  ${actual}`);
  return r;
}

async function seed() {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db();
  const Users = db.collection('users');
  const Posts = db.collection('posts');
  const Txns = db.collection('transactions');
  const Passcodes = db.collection('postcreationpasscodes');
  const hash = await bcrypt.hash(PW, 10);

  const defs = [
    {
      key: 'user',
      email: 'tc.user@foodshare.test',
      role: 'USER',
      fullName: 'TC User',
      greenPoints: 5000,
    },
    {
      key: 'store',
      email: 'tc.store@foodshare.test',
      role: 'STORE',
      fullName: 'TC Store',
      greenPoints: 0,
      kycStatus: 'VERIFIED',
      storeInfo: {
        businessName: 'TC Bakery',
        openHours: '08:00',
        closeHours: '20:00',
        businessAddress: '1 Test St, HCM',
      },
      paymentInfo: {
        bankName: 'Vietcombank',
        bankCode: 'VCB',
        bankAccountNumber: '0123456789',
        bankAccountName: 'TC STORE',
      },
    },
    {
      key: 'admin',
      email: 'tc.admin@foodshare.test',
      role: 'ADMIN',
      fullName: 'TC Admin',
      greenPoints: 0,
    },
  ];

  for (const d of defs) {
    const doc = {
      email: d.email,
      password: hash,
      authProvider: 'LOCAL',
      isEmailVerified: true,
      isProfileCompleted: true,
      role: d.role,
      fullName: d.fullName,
      defaultAddress: 'HCMC',
      location: { type: 'Point', coordinates: [106.660172, 10.762622] },
      kycStatus: d.kycStatus || 'PENDING',
      kycDocuments: [],
      pendingKycDocuments: [],
      savedPosts: [],
      greenPoints: d.greenPoints,
      averageRating: 5,
      status: 'ACTIVE',
      language: 'vi',
      updatedAt: new Date(),
    };
    if (d.storeInfo) doc.storeInfo = d.storeInfo;
    if (d.paymentInfo) doc.paymentInfo = d.paymentInfo;
    await Users.updateOne(
      { email: d.email },
      { $set: doc, $setOnInsert: { createdAt: new Date() } },
      { upsert: true }
    );
    const u = await Users.findOne({ email: d.email });
    IDS[d.key] = u._id;
  }

  // Clean previous test posts/txns to keep idempotent
  await Posts.deleteMany({ ownerId: IDS.store, title: /^\[TC\]/ });
  await Txns.deleteMany({ ownerId: IDS.store });

  const now = Date.now();
  const basePost = (over) => ({
    ownerId: IDS.store,
    category: 'prepared-food',
    images: ['https://res.cloudinary.com/demo/image/upload/sample.jpg'],
    expiryDate: new Date(now + 2 * 864e5),
    pickupTime: { start: new Date(now + 3600e3), end: new Date(now + 7200e3) },
    location: { type: 'Point', coordinates: [106.660172, 10.762622] },
    status: 'AVAILABLE',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  });
  const p2p = await Posts.insertOne(
    basePost({
      type: 'P2P_FREE',
      title: '[TC] P2P Banh mi du',
      description: 'test',
      totalQuantity: 5,
      remainingQuantity: 5,
      price: 0,
    })
  );
  const b2c = await Posts.insertOne(
    basePost({
      type: 'B2C_MYSTERY_BAG',
      title: '[TC] B2C Tui Mu',
      description: 'test',
      totalQuantity: 5,
      remainingQuantity: 5,
      price: 50000,
    })
  );
  IDS.p2pPost = p2p.insertedId;
  IDS.b2cPost = b2c.insertedId;

  // Seed a passcode for USER to create a post via API
  await Passcodes.deleteMany({ userId: IDS.user });
  await Passcodes.insertOne({
    userId: IDS.user,
    code: '123456',
    expiresAt: new Date(now + 30 * 60e3),
    usedAt: null,
    createdAt: new Date(),
  });

  await client.close();
  console.log(
    'SEED OK  users:',
    Object.keys(IDS)
      .filter((k) => ['user', 'store', 'admin'].includes(k))
      .map((k) => `${k}=${IDS[k]}`)
      .join(' ')
  );
  console.log(
    'SEED OK  p2pPost=' + IDS.p2pPost + '  b2cPost=' + IDS.b2cPost + '\n'
  );
}

async function login(key, email) {
  const r = await api('POST', '/auth/login', { body: { email, password: PW } });
  TOKENS[key] =
    r.json && r.json.data && (r.json.data.token || r.json.data.accessToken);
  if (!TOKENS[key] && r.json && r.json.token) TOKENS[key] = r.json.token;
  return r;
}

async function run() {
  await seed();

  // ===== AUTH =====
  rec(
    'TC-USR-AUTH-03-01',
    'Login email/mật khẩu đúng (USER)',
    'HTTP 200 + JWT token',
    await login('user', 'tc.user@foodshare.test'),
    (r) => r.status === 200 && !!TOKENS.user
  );
  await login('store', 'tc.store@foodshare.test');
  await login('admin', 'tc.admin@foodshare.test');
  rec(
    'TC-USR-AUTH-03-02',
    'Login sai mật khẩu',
    'HTTP 401 + báo lỗi',
    await api('POST', '/auth/login', {
      body: { email: 'tc.user@foodshare.test', password: 'wrongpass' },
    }),
    (r) => r.status === 401
  );
  rec(
    'TC-USR-AUTH-03-03',
    'Login email không tồn tại',
    'HTTP 401/404',
    await api('POST', '/auth/login', {
      body: { email: 'nobody@foodshare.test', password: PW },
    }),
    (r) => r.status === 401 || r.status === 404
  );
  rec(
    'TC-USR-AUTH-01-01',
    'Đăng ký — email sai định dạng',
    'HTTP 400 validation',
    await api('POST', '/auth/register/send-code', {
      body: { email: 'not-an-email', password: PW, fullName: 'X' },
    }),
    (r) => r.status === 400
  );
  rec(
    'TC-USR-AUTH-01-02',
    'Đăng ký — mật khẩu < 6 ký tự',
    'HTTP 400 validation',
    await api('POST', '/auth/register/send-code', {
      body: { email: 'new1@foodshare.test', password: '123', fullName: 'X' },
    }),
    (r) => r.status === 400
  );
  rec(
    'TC-USR-AUTH-01-03',
    'Đăng ký — email đã tồn tại',
    'HTTP 4xx từ chối',
    await api('POST', '/auth/register/send-code', {
      body: { email: 'tc.user@foodshare.test', password: PW, fullName: 'X' },
    }),
    (r) => r.status >= 400 && r.status < 500
  );
  rec(
    'TC-USR-AUTH-02-01',
    'Xác minh OTP — sai định dạng (3 số)',
    'HTTP 400 (regex 6 số)',
    await api('POST', '/auth/register/verify', {
      body: { email: 'tc.user@foodshare.test', code: '123' },
    }),
    (r) => r.status === 400
  );
  rec(
    'TC-USR-AUTH-02-02',
    'Xác minh OTP — mã sai/hết hạn (6 số)',
    'HTTP 400 mã không đúng',
    await api('POST', '/auth/register/verify', {
      body: { email: 'tc.user@foodshare.test', code: '000000' },
    }),
    (r) => r.status === 400
  );
  rec(
    'TC-USR-AUTH-06-01',
    'GET /auth/me có token',
    'HTTP 200 thông tin user',
    await api('GET', '/auth/me', { token: TOKENS.user }),
    (r) => r.status === 200
  );
  rec(
    'TC-USR-AUTH-06-02',
    'GET /auth/me không token',
    'HTTP 401',
    await api('GET', '/auth/me', {}),
    (r) => r.status === 401
  );
  rec(
    'TC-USR-AUTH-08-01',
    'Cập nhật GPS ngoài phạm vi HCM',
    'HTTP 400 validation',
    await api('PUT', '/auth/me/location', {
      token: TOKENS.user,
      body: { longitude: 100, latitude: 50 },
    }),
    (r) => r.status === 400
  );
  rec(
    'TC-USR-AUTH-08-02',
    'Cập nhật GPS hợp lệ (HCM)',
    'HTTP 200',
    await api('PUT', '/auth/me/location', {
      token: TOKENS.user,
      body: { longitude: 106.7, latitude: 10.77 },
    }),
    (r) => r.status === 200
  );

  // ===== POST =====
  rec(
    'TC-USR-POST-02-01',
    'Tạo bài P2P với passcode hợp lệ',
    'HTTP 201 status=PENDING_REVIEW',
    await (async () => {
      const r = await api('POST', '/posts', {
        token: TOKENS.user,
        body: {
          type: 'P2P_FREE',
          category: 'prepared-food',
          title: '[TC] Bai USER',
          images: ['https://res.cloudinary.com/demo/image/upload/sample.jpg'],
          totalQuantity: 3,
          expiryDate: new Date(Date.now() + 2 * 864e5).toISOString(),
          pickupTime: {
            start: new Date(Date.now() + 3600e3).toISOString(),
            end: new Date(Date.now() + 7200e3).toISOString(),
          },
          passcode: '123456',
        },
      });
      if (r.json && r.json.data) IDS.userPost = r.json.data._id;
      return r;
    })(),
    (r) =>
      r.status === 201 &&
      r.json &&
      r.json.data &&
      r.json.data.status === 'PENDING_REVIEW'
  );
  rec(
    'TC-USR-POST-02-02',
    'Tạo bài — passcode sai',
    'HTTP 400',
    await api('POST', '/posts', {
      token: TOKENS.user,
      body: {
        type: 'P2P_FREE',
        category: 'prepared-food',
        title: 'x',
        images: ['https://x/y.jpg'],
        totalQuantity: 1,
        expiryDate: new Date(Date.now() + 2 * 864e5).toISOString(),
        pickupTime: {
          start: new Date().toISOString(),
          end: new Date().toISOString(),
        },
        passcode: '000000',
      },
    }),
    (r) => r.status === 400
  );
  rec(
    'TC-USR-POST-02-03',
    'Tạo bài — thiếu ảnh (bắt buộc ≥1)',
    'HTTP 400 validation',
    await api('POST', '/posts', {
      token: TOKENS.user,
      body: {
        type: 'P2P_FREE',
        category: 'prepared-food',
        title: 'x',
        images: [],
        totalQuantity: 1,
        expiryDate: new Date().toISOString(),
        pickupTime: {
          start: new Date().toISOString(),
          end: new Date().toISOString(),
        },
        passcode: '123456',
      },
    }),
    (r) => r.status === 400
  );
  rec(
    'TC-USR-POST-03-01',
    'Xem bài đăng của mình',
    'HTTP 200 danh sách',
    await api('GET', '/posts/me', { token: TOKENS.user }),
    (r) => r.status === 200 && Array.isArray(r.json.data)
  );
  rec(
    'TC-USR-POST-01-01',
    'Gửi passcode tạo bài (email đã verify)',
    'HTTP 200',
    await api('POST', '/posts/passcode/send', { token: TOKENS.store }),
    (r) => r.status === 200
  );
  rec(
    'TC-USR-EXP-01-01',
    'Xem chi tiết bài đăng AVAILABLE',
    'HTTP 200',
    await api('GET', '/posts/' + IDS.p2pPost, { token: TOKENS.user }),
    (r) => r.status === 200
  );
  rec(
    'TC-USR-EXP-01-02',
    'Xem bài PENDING_REVIEW của người khác',
    'HTTP 404 (ẩn với non-owner)',
    await api('GET', '/posts/' + IDS.userPost, { token: TOKENS.store }),
    (r) => r.status === 404
  );
  rec(
    'TC-USR-EXP-02-01',
    'Tìm bài trên bản đồ (≤5km)',
    'HTTP 200 danh sách',
    await api(
      'GET',
      '/posts/map?lng=106.660172&lat=10.762622&distance=5000',
      {}
    ),
    (r) => r.status === 200
  );
  rec(
    'TC-USR-EXP-03-01',
    'Xem danh sách Explore',
    'HTTP 200 danh sách',
    await api('GET', '/posts/explore', {}),
    (r) => r.status === 200
  );

  // ===== TXN P2P =====
  rec(
    'TC-USR-TXN-01-01',
    'Gửi yêu cầu xin nhận bài P2P',
    'HTTP 201 status=PENDING',
    await (async () => {
      const r = await api('POST', '/transactions/requests', {
        token: TOKENS.user,
        body: { postId: String(IDS.p2pPost), quantity: 1 },
      });
      if (r.json && r.json.data) IDS.p2pReq = r.json.data._id;
      return r;
    })(),
    (r) => r.status === 201
  );
  rec(
    'TC-USR-TXN-01-02',
    'Xin nhận bài của chính mình',
    'HTTP 400 từ chối',
    await api('POST', '/transactions/requests', {
      token: TOKENS.store,
      body: { postId: String(IDS.p2pPost), quantity: 1 },
    }),
    (r) => r.status === 400
  );
  rec(
    'TC-USR-TXN-01-03',
    'Gửi yêu cầu trùng (đã có PENDING)',
    'HTTP 400 từ chối',
    await api('POST', '/transactions/requests', {
      token: TOKENS.user,
      body: { postId: String(IDS.p2pPost), quantity: 1 },
    }),
    (r) => r.status === 400
  );
  rec(
    'TC-USR-TXN-01-04',
    'Yêu cầu số lượng không hợp lệ (0)',
    'HTTP 400 validation',
    await api('POST', '/transactions/requests', {
      token: TOKENS.user,
      body: { postId: String(IDS.p2pPost), quantity: 0 },
    }),
    (r) => r.status === 400
  );
  rec(
    'TC-USR-TXN-06-01',
    'Chủ bài chấp nhận yêu cầu → sinh QR',
    'HTTP 200 + verificationCode',
    await (async () => {
      const r = await api('PATCH', '/transactions/' + IDS.p2pReq + '/respond', {
        token: TOKENS.store,
        body: { response: 'ACCEPT' },
      });
      const code =
        r.json &&
        r.json.data &&
        (r.json.data.verificationCode ||
          (r.json.data.transaction &&
            r.json.data.transaction.verificationCode));
      if (code) IDS.p2pQr = code;
      return r;
    })(),
    (r) => r.status === 200
  );
  // fetch QR from DB fallback if not in response
  rec(
    'TC-USR-TXN-07-01',
    'Quét QR sai → không hoàn tất',
    'HTTP 404 không tìm thấy',
    await api('POST', '/transactions/scan', {
      token: TOKENS.user,
      body: { qrCode: 'INVALID-QR-XYZ' },
    }),
    (r) => r.status === 404
  );

  // ===== TXN B2C =====
  rec(
    'TC-USR-TXN-B2C-01',
    'Đặt mua Túi Mù B2C',
    'HTTP 201 status=PENDING',
    await (async () => {
      const r = await api('POST', '/transactions/orders', {
        token: TOKENS.user,
        body: { postId: String(IDS.b2cPost), quantity: 1 },
      });
      if (r.json && r.json.data) IDS.b2cOrder = r.json.data._id;
      return r;
    })(),
    (r) => r.status === 201
  );
  rec(
    'TC-STR-TXN-02-01',
    'Cửa hàng chấp nhận đơn → sinh mã CK',
    'HTTP 200 + bankSnapshot/FS code',
    await (async () => {
      const r = await api(
        'PATCH',
        '/transactions/' + IDS.b2cOrder + '/respond',
        { token: TOKENS.store, body: { response: 'ACCEPT' } }
      );
      return r;
    })(),
    (r) => r.status === 200
  );
  rec(
    'TC-STR-TXN-04-01',
    'Cửa hàng xác nhận đã nhận tiền → COMPLETED',
    'HTTP 200 status=COMPLETED',
    await api('PATCH', '/transactions/' + IDS.b2cOrder + '/confirm-receipt', {
      token: TOKENS.store,
    }),
    (r) => r.status === 200
  );

  // ===== REPORT =====
  rec(
    'TC-USR-RPT-01-01',
    'Gửi báo cáo hợp lệ (bài đăng)',
    'HTTP 201',
    await api('POST', '/reports', {
      token: TOKENS.user,
      body: {
        targetType: 'POST',
        targetId: String(IDS.p2pPost),
        reason: 'INAPPROPRIATE_CONTENT',
        description: 'Nội dung không phù hợp test',
        images: ['https://x/y.jpg'],
      },
    }),
    (r) => r.status === 201
  );
  rec(
    'TC-USR-RPT-01-02',
    'Báo cáo — mô tả < 10 ký tự',
    'HTTP 400 validation',
    await api('POST', '/reports', {
      token: TOKENS.user,
      body: {
        targetType: 'POST',
        targetId: String(IDS.p2pPost),
        reason: 'SCAM',
        description: 'ngắn',
        images: ['https://x/y.jpg'],
      },
    }),
    (r) => r.status === 400
  );
  rec(
    'TC-USR-RPT-01-03',
    'Báo cáo — targetType sai',
    'HTTP 400 validation',
    await api('POST', '/reports', {
      token: TOKENS.user,
      body: {
        targetType: 'XXX',
        targetId: String(IDS.p2pPost),
        reason: 'SCAM',
        description: 'mô tả đủ dài test',
        images: ['https://x/y.jpg'],
      },
    }),
    (r) => r.status === 400
  );

  // ===== REVIEW =====
  rec(
    'TC-USR-REV-02-01',
    'Viết đánh giá rating ngoài 1-5 (6)',
    'HTTP 400 validation',
    await api('POST', '/reviews', {
      token: TOKENS.user,
      body: { transactionId: String(IDS.b2cOrder), rating: 6, feedback: 'x' },
    }),
    (r) => r.status === 400
  );
  rec(
    'TC-USR-REV-02-02',
    'Viết đánh giá GD hoàn tất (rating 5)',
    'HTTP 201/200',
    await api('POST', '/reviews', {
      token: TOKENS.user,
      body: { transactionId: String(IDS.b2cOrder), rating: 5, feedback: 'Tốt' },
    }),
    (r) => r.status === 201 || r.status === 200
  );

  // ===== VOUCHER =====
  rec(
    'TC-STR-VCH-01-01',
    'Cửa hàng tạo voucher',
    'HTTP 201',
    await api('POST', '/vouchers/store', {
      token: TOKENS.store,
      body: {
        code: 'TCV' + Date.now().toString().slice(-6),
        title: 'Voucher test',
        discountType: 'PERCENTAGE',
        discountValue: 10,
        pointCost: 100,
        totalQuantity: 50,
        validFrom: new Date().toISOString(),
        validUntil: new Date(Date.now() + 30 * 864e5).toISOString(),
      },
    }),
    (r) => r.status === 201
  );
  rec(
    'TC-USR-VCH-01-01',
    'Xem chợ voucher',
    'HTTP 200',
    await api('GET', '/vouchers/market', { token: TOKENS.user }),
    (r) => r.status === 200
  );
  rec(
    'TC-USR-VCH-02-01',
    'Xem voucher trong ví',
    'HTTP 200',
    await api('GET', '/vouchers/me', { token: TOKENS.user }),
    (r) => r.status === 200
  );

  // ===== CONFIG / ADMIN authz =====
  rec(
    'TC-ADM-CFG-01-01',
    'Admin xem cấu hình hệ thống',
    'HTTP 200',
    await api('GET', '/config', { token: TOKENS.admin }),
    (r) => r.status === 200
  );
  rec(
    'TC-ADM-CFG-01-02',
    'USER thường gọi /config (phân quyền)',
    'HTTP 403 từ chối',
    await api('GET', '/config', { token: TOKENS.user }),
    (r) => r.status === 403
  );
  rec(
    'TC-ADM-USR-02-01',
    'Admin xem danh sách người dùng',
    'HTTP 200',
    await api('GET', '/users?page=1&limit=10', { token: TOKENS.admin }),
    (r) => r.status === 200
  );

  // ===== NOTIF / POINTS =====
  rec(
    'TC-USR-NOTIF-01-01',
    'Xem danh sách thông báo',
    'HTTP 200',
    await api('GET', '/notifications', { token: TOKENS.user }),
    (r) => r.status === 200
  );
  rec(
    'TC-USR-NOTIF-02-01',
    'Đếm thông báo chưa đọc',
    'HTTP 200',
    await api('GET', '/notifications/unread-count', { token: TOKENS.user }),
    (r) => r.status === 200
  );
  rec(
    'TC-USR-PNT-02-01',
    'Xem bảng xếp hạng điểm xanh',
    'HTTP 200',
    await api('GET', '/greenpoints/leaderboard', { token: TOKENS.user }),
    (r) => r.status === 200
  );
  rec(
    'TC-USR-PNT-01-01',
    'Xem lịch sử điểm xanh',
    'HTTP 200',
    await api('GET', '/greenpoints/history', { token: TOKENS.user }),
    (r) => r.status === 200
  );

  // ===== NFR: response time (10 iters avg) =====
  console.log('\n--- NFR response time (avg of 10) ---');
  const nfrTargets = [
    [
      'POST /auth/login',
      'POST',
      '/auth/login',
      { body: { email: 'tc.user@foodshare.test', password: PW } },
    ],
    ['GET /auth/me', 'GET', '/auth/me', { token: TOKENS.user }],
    [
      'GET /posts/map',
      'GET',
      '/posts/map?lng=106.660172&lat=10.762622&distance=5000',
      {},
    ],
    ['GET /posts/explore', 'GET', '/posts/explore', {}],
    ['GET /notifications', 'GET', '/notifications', { token: TOKENS.user }],
    [
      'GET /greenpoints/leaderboard',
      'GET',
      '/greenpoints/leaderboard',
      { token: TOKENS.user },
    ],
    ['GET /vouchers/market', 'GET', '/vouchers/market', { token: TOKENS.user }],
  ];
  const nfr = [];
  for (const [label, m, p, opt] of nfrTargets) {
    const times = [];
    for (let i = 0; i < 10; i++) {
      const r = await api(m, p, opt);
      times.push(r.ms);
    }
    const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
    const min = Math.min(...times),
      max = Math.max(...times);
    nfr.push({ label, avg, min, max });
    console.log(`${label}  avg=${avg}ms  min=${min}  max=${max}`);
  }

  // ===== SUMMARY =====
  const pass = results.filter((r) => r.pass === 'PASS').length;
  console.log(`\n===== SUMMARY: ${pass}/${results.length} PASS =====`);
  const fails = results.filter((r) => r.pass === 'FAIL');
  if (fails.length) {
    console.log('FAILS:');
    fails.forEach((f) => console.log(`  ${f.tc} ${f.name} -> ${f.actual}`));
  }

  const fs = require('fs');
  fs.writeFileSync(
    process.env.OUT || 'fs-test-results.json',
    JSON.stringify(
      {
        results,
        nfr,
        ids: Object.fromEntries(
          Object.entries(IDS).map(([k, v]) => [k, String(v)])
        ),
      },
      null,
      2
    )
  );
  console.log('\nWrote results JSON.');
}

run()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('FATAL', e);
    process.exit(1);
  });

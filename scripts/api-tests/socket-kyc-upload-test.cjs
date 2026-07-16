/* Kiểm thử thật nhóm TC Socket.io + dịch vụ ngoài + luồng KYC (Phụ lục D — Bảng D.2a).
 * Yêu cầu: backend đang chạy (npm run dev) + đã chạy api-test-runner.cjs trước (tạo user test).
 * Cần socket.io-client: npm i -D socket.io-client
 * Chạy từ thư mục foodshare-backend-server:
 *   node scripts/api-tests/socket-kyc-upload-test.cjs
 */
require('dotenv').config({ quiet: true });
const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { io } = require('socket.io-client');

const BASE = 'http://localhost:5000/api';
const ORIGIN = 'http://localhost:5000';
const SECRET = process.env.JWT_SECRET;
const out = [];
function log(tc, name, expected, actual, pass) {
  out.push({ tc, name, expected, actual, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${tc}  ${name}  ->  ${actual}`);
}
function tok(id, role) {
  return jwt.sign({ id: String(id), role }, SECRET, { expiresIn: '1h' });
}
async function api(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {}
  return { status: res.status, json };
}

(async () => {
  const c = new MongoClient(process.env.MONGODB_URI);
  await c.connect();
  const db = c.db();
  const Users = db.collection('users');
  const hash = await bcrypt.hash('Test@1234', 10);

  // Fresh KYC candidate (plain USER)
  await Users.deleteOne({ email: 'tc.kyc@foodshare.test' });
  await Users.insertOne({
    email: 'tc.kyc@foodshare.test',
    password: hash,
    authProvider: 'LOCAL',
    isEmailVerified: true,
    isProfileCompleted: true,
    role: 'USER',
    fullName: 'TC KYC',
    defaultAddress: 'HCMC',
    location: { type: 'Point', coordinates: [106.66, 10.76] },
    kycStatus: 'PENDING',
    kycDocuments: [],
    pendingKycDocuments: [],
    savedPosts: [],
    greenPoints: 0,
    averageRating: 5,
    status: 'ACTIVE',
    language: 'vi',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const kyc = await Users.findOne({ email: 'tc.kyc@foodshare.test' });
  const user = await Users.findOne({ email: 'tc.user@foodshare.test' });
  const store = await Users.findOne({ email: 'tc.store@foodshare.test' });
  const admin = await Users.findOne({ email: 'tc.admin@foodshare.test' });

  const kycTok = tok(kyc._id, 'USER'),
    adminTok = tok(admin._id, 'ADMIN');
  const userTok = tok(user._id, user.role),
    storeTok = tok(store._id, store.role);

  // ---- M1: KYC submit (register-store) ----
  let r = await api('POST', '/auth/register-store', {
    token: kycTok,
    body: {
      storeInfo: {
        businessName: 'TC KYC Shop',
        openHours: '08:00',
        closeHours: '21:00',
        businessAddress: '9 KYC St, HCM',
      },
      kycDocuments: ['https://res.cloudinary.com/demo/image/upload/kyc1.jpg'],
      paymentInfo: {
        bankName: 'ACB',
        bankCode: 'ACB',
        bankAccountNumber: '99988877',
        bankAccountName: 'TC KYC',
      },
    },
  });
  log(
    'TC-STR-AUTH-10-01',
    'Đăng ký KYC cửa hàng (nộp hồ sơ)',
    'HTTP 200/201, status=PENDING_KYC',
    `HTTP ${r.status} | ${r.json && r.json.message}`,
    r.status === 200 || r.status === 201
  );
  const afterSubmit = await Users.findOne({ _id: kyc._id });

  // ---- M2: Admin duyệt KYC ----
  r = await api('PATCH', '/users/' + kyc._id + '/kyc-review', {
    token: adminTok,
    body: { action: 'APPROVE' },
  });
  const afterApprove = await Users.findOne({ _id: kyc._id });
  log(
    'TC-ADM-USR-05-01',
    'Admin duyệt KYC → nâng cấp STORE',
    'HTTP 200, role=STORE, kycStatus=VERIFIED',
    `HTTP ${r.status} | role=${afterApprove.role}, kycStatus=${afterApprove.kycStatus}, status=${afterApprove.status}`,
    r.status === 200 &&
      afterApprove.role === 'STORE' &&
      afterApprove.kycStatus === 'VERIFIED'
  );

  // ---- M3: Upload ảnh lên Cloudinary (multipart) ----
  // 1x1 PNG
  const pngB64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const buf = Buffer.from(pngB64, 'base64');
  const fd = new FormData();
  fd.append('image', new Blob([buf], { type: 'image/png' }), 'tc.png');
  let upStatus = 0,
    upBody = null;
  try {
    const up = await fetch(BASE + '/upload/single?folder=posts', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + userTok },
      body: fd,
    });
    upStatus = up.status;
    upBody = await up.json().catch(() => null);
  } catch (e) {
    upBody = { message: 'ERR ' + e.message };
  }
  const upUrl =
    upBody &&
    upBody.data &&
    (upBody.data.url || upBody.data.secure_url || upBody.data.imageUrl);
  log(
    'TC-USR-UPL-01-01',
    'Upload ảnh lên Cloudinary',
    'HTTP 200/201, trả URL Cloudinary',
    `HTTP ${upStatus} | ${upUrl ? upUrl.slice(0, 60) : upBody && upBody.message}`,
    (upStatus === 200 || upStatus === 201) && !!upUrl
  );

  // ---- M4: Chat tạo hội thoại + gửi tin (REST) ----
  r = await api('POST', '/chat/conversations', {
    token: userTok,
    body: { receiverId: String(store._id) },
  });
  const convId =
    r.json &&
    r.json.data &&
    (r.json.data._id ||
      r.json.data.conversationId ||
      (r.json.data.conversation && r.json.data.conversation._id));
  log(
    'TC-USR-CHAT-02-01',
    'Tạo / mở phòng chat 1-1',
    'HTTP 200/201, trả conversationId',
    `HTTP ${r.status} | convId=${convId}`,
    (r.status === 200 || r.status === 201) && !!convId
  );

  r = await api('POST', '/chat/messages', {
    token: userTok,
    body: { conversationId: String(convId), text: 'Xin chào, test realtime' },
  });
  const msg = r.json && r.json.data;
  const msgId = msg && (msg._id || msg.id);
  log(
    'TC-USR-CHAT-03-01',
    'Gửi tin nhắn (lưu DB qua REST)',
    'HTTP 200/201, tin nhắn được lưu',
    `HTTP ${r.status} | msgId=${msgId}`,
    (r.status === 200 || r.status === 201) && !!msgId
  );

  // ---- M5: Realtime delivery qua Socket.io (2 client) ----
  const mkSocket = (t) =>
    io(ORIGIN, {
      auth: { token: t },
      transports: ['websocket'],
      reconnection: false,
    });
  const sender = mkSocket(userTok),
    receiver = mkSocket(storeTok);
  const connectBoth = new Promise((resolve) => {
    let n = 0;
    const done = () => ++n === 2 && resolve();
    sender.on('connect', done);
    receiver.on('connect', done);
    setTimeout(resolve, 4000);
  });
  await connectBoth;
  const realtimeOK = await new Promise((resolve) => {
    let settled = false;
    receiver.on('new-message', (m) => {
      if (!settled) {
        settled = true;
        resolve({ ok: true, m });
      }
    });
    receiver.emit('join-room', String(convId));
    sender.emit('join-room', String(convId));
    setTimeout(() => {
      // sender relays a new message over socket (like the app does after REST save)
      sender.emit('client-message', {
        conversationId: String(convId),
        message: {
          _id: String(msgId),
          text: 'realtime ping',
          senderId: String(user._id),
        },
      });
    }, 500);
    setTimeout(() => {
      if (!settled) resolve({ ok: false });
    }, 4000);
  });
  log(
    'TC-USR-CHAT-03-02',
    'Nhận tin nhắn realtime (Socket.io)',
    'Client B nhận sự kiện new-message',
    realtimeOK.ok
      ? 'Nhận được new-message qua socket'
      : 'KHÔNG nhận được trong 4s',
    realtimeOK.ok
  );

  // ---- M6: Thu hồi tin nhắn (REST) + relay recall ----
  r = await api('POST', '/chat/messages/' + msgId + '/recall', {
    token: userTok,
  });
  const recallOK = r.status === 200 || r.status === 201;
  const recalledEvent = await new Promise((resolve) => {
    let settled = false;
    receiver.on('message:recalled', () => {
      if (!settled) {
        settled = true;
        resolve(true);
      }
    });
    if (recallOK)
      sender.emit('client-message-recall', {
        conversationId: String(convId),
        messageId: String(msgId),
      });
    setTimeout(() => {
      if (!settled) resolve(false);
    }, 3000);
  });
  log(
    'TC-USR-CHAT-08-01',
    'Thu hồi tin nhắn (REST + realtime)',
    'HTTP 200 + client B nhận message:recalled',
    `HTTP ${r.status} | ${r.json && r.json.message} | realtime=${recalledEvent ? 'nhận message:recalled' : 'không nhận'}`,
    recallOK && recalledEvent
  );

  // ---- Negative: Google OAuth với idToken sai (phần chạy được của TC Google) ----
  r = await api('POST', '/auth/google-login', {
    token: null,
    body: { idToken: 'invalid.token.value' },
  });
  log(
    'TC-USR-AUTH-04-02',
    'Đăng nhập Google — idToken không hợp lệ (negative)',
    'HTTP 4xx từ chối',
    `HTTP ${r.status} | ${r.json && r.json.message}`,
    r.status >= 400 && r.status < 500
  );

  sender.close();
  receiver.close();
  await c.close();
  const pass = out.filter((o) => o.pass).length;
  console.log(
    `\n===== MANUAL-RUNNABLE SUMMARY: ${pass}/${out.length} PASS =====`
  );
  console.log(
    'KYC after submit: status=' +
      afterSubmit.status +
      ', kycStatus=' +
      afterSubmit.kycStatus
  );
  require('fs').writeFileSync(
    process.env.OUT || 'fs-manual-results.json',
    JSON.stringify({ out, upUrl }, null, 2)
  );
  process.exit(0);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});

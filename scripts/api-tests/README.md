# Script kiểm thử API — FoodShare

Bộ script Node.js dùng để thực thi các test case trong **Phụ lục D** của báo cáo khóa luận
(mục 3.7 Test Plan + mục 4.1.3 Kết quả kiểm thử). Toàn bộ kết quả "Kết quả thực tế / Trạng thái"
trong bảng test case và số liệu Bảng 59 (thời gian phản hồi) được sinh ra từ các script này.

## Cấu trúc

| File                         | Vai trò                                                                                   |
| ---------------------------- | ----------------------------------------------------------------------------------------- |
| `api-test-runner.cjs`        | 47 test case REST API (Bảng 60, mục D.1) + đo NFR thời gian phản hồi (Bảng 59)            |
| `socket-kyc-upload-test.cjs` | 8 test case Socket.io realtime, thu hồi tin nhắn, upload Cloudinary, luồng KYC (mục D.2a) |
| `results-api-test.json`      | Kết quả chạy thật của `api-test-runner.cjs` (47/47 Pass + số đo NFR)                      |
| `results-socket-test.json`   | Kết quả chạy thật của `socket-kyc-upload-test.cjs` (8/8 Pass)                             |

## Cách chạy

```bash
# 0. Cài dependencies (socket.io-client đã có trong devDependencies)
npm install

# 1. Khởi động backend ở terminal khác
npm run dev

# 2. Chạy bộ test API (seed user test + gọi endpoint thật + đo NFR)
node scripts/api-tests/api-test-runner.cjs

# 3. Chạy bộ test Socket.io + KYC + upload (sau bước 2)
node scripts/api-tests/socket-kyc-upload-test.cjs
```

## Cách hoạt động

- **Seed:** kết nối thẳng MongoDB (dùng `MONGODB_URI` trong `.env`) để tạo 3 tài khoản test
  (`tc.user@foodshare.test`, `tc.store@foodshare.test`, `tc.admin@foodshare.test`, mật khẩu `Test@1234`),
  2 bài đăng mẫu và passcode tạo bài — idempotent, chạy lại không tạo trùng.
- **Gọi API:** dùng `fetch` gọi endpoint thật trên `http://localhost:5000/api`, so khớp
  HTTP status + response với kết quả mong đợi của từng test case, in PASS/FAIL từng dòng.
- **Đo NFR:** mỗi API chính gọi 10 lần, đo `Date.now()` trước/sau mỗi request (round-trip
  từ client, gồm xử lý Express + truy vấn Atlas + độ trễ mạng), lấy trung bình/min/max.
- **Realtime:** mở 2 client Socket.io (xác thực JWT) mô phỏng 2 thiết bị, kiểm chứng
  sự kiện `new-message` và `message:recalled` được broadcast tới client còn lại.

## Lưu ý

- Endpoint `POST /api/auth/login` có rate limit (10 lần/15 phút) — chạy lại bộ test liên tục
  có thể gặp HTTP 429; chờ hết cửa sổ 15 phút.
- Script chỉ dùng cho môi trường development. Dữ liệu test có tiền tố `tc.` / `[TC]`,
  có thể xóa khỏi DB sau khi kiểm thử.

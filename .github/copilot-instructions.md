# 📘 BỘ QUY TẮC CHUẨN (CODING CONVENTIONS) — FoodShare Backend Server

> **Tech Stack:** Node.js · Express.js v5 · TypeScript · MongoDB (Mongoose) · Socket.io  
> **Mục đích:** Đảm bảo tính nhất quán, dễ bảo trì và mở rộng cho toàn bộ codebase.

---

## 📁 1. Cấu trúc thư mục dự án

```
src/
├── controllers/       # Xử lý logic nghiệp vụ cho từng route
├── middlewares/        # Middleware xác thực, phân quyền, validate...
├── models/            # Mongoose schema & model definitions
├── routes/            # Định nghĩa API endpoints
├── services/          # (Khuyến nghị) Business logic tách riêng khỏi controller
├── utils/             # Hàm tiện ích dùng chung (hash, token, helper...)
├── types/             # (Khuyến nghị) Custom TypeScript type/interface definitions
├── config/            # (Khuyến nghị) Cấu hình DB, env, constants
├── validations/       # (Khuyến nghị) Schema validation (Joi/Zod)
└── server.ts          # Entry point — khởi tạo Express, MongoDB, Socket.io
```

### Quy tắc đặt tên file

| Thư mục        | Quy tắc đặt tên                   | Ví dụ                                     |
| -------------- | --------------------------------- | ----------------------------------------- |
| `controllers/` | `camelCase` + hậu tố `Controller` | `authController.ts`, `postController.ts`  |
| `middlewares/` | `camelCase` + hậu tố `Middleware` | `authMiddleware.ts`, `errorMiddleware.ts` |
| `models/`      | `PascalCase` (tên Model)          | `User.ts`, `Post.ts`, `Transaction.ts`    |
| `routes/`      | `camelCase` + hậu tố `Routes`     | `authRoutes.ts`, `postRoutes.ts`          |
| `services/`    | `camelCase` + hậu tố `Service`    | `authService.ts`, `postService.ts`        |
| `utils/`       | `camelCase` (mô tả chức năng)     | `auth.ts`, `responseHelper.ts`            |
| `types/`       | `camelCase` + hậu tố `.types`     | `user.types.ts`, `post.types.ts`          |
| `validations/` | `camelCase` + hậu tố `Validation` | `authValidation.ts`, `postValidation.ts`  |

---

## 🔤 2. Quy tắc đặt tên (Naming Conventions)

### Biến & Hàm

- Sử dụng **camelCase** cho tất cả biến và hàm.
- Tên phải **mô tả rõ ý nghĩa**, tránh viết tắt không phổ biến.

```typescript
// ✅ Đúng
const accessToken = generateToken(user);
const isExpired = checkTokenExpiry(token);
async function createFoodPost(data: CreatePostInput): Promise<IPost> { ... }

// ❌ Sai
const tk = genTk(u);
const x = chk(t);
async function crt(d: any) { ... }
```

### Interface & Type

- Sử dụng **PascalCase**.
- Interface có prefix `I` cho Mongoose document types.
- Type/DTO không cần prefix.

```typescript
// Mongoose document interface
interface IUser extends Document {
  fullName: string;
  email: string;
  passwordHash: string;
}

// DTO / Input types
type CreatePostInput = {
  title: string;
  description: string;
  quantity: number;
  expiryDate: Date;
};

// Enum-like union types
type TransactionStatus = 'pending' | 'accepted' | 'completed' | 'cancelled';
type PostStatus = 'available' | 'reserved' | 'completed' | 'expired';
```

### Enum

- Sử dụng **PascalCase** cho tên enum, **UPPER_SNAKE_CASE** cho giá trị.

```typescript
enum HttpStatusCode {
  OK = 200,
  CREATED = 201,
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  NOT_FOUND = 404,
  INTERNAL_SERVER_ERROR = 500,
}
```

### Constants

- Sử dụng **UPPER_SNAKE_CASE** cho hằng số.

```typescript
const MAX_POST_IMAGES = 5;
const DEFAULT_PAGE_SIZE = 20;
const JWT_EXPIRY_TIME = '7d';
const POINT_REWARD_PER_SHARE = 10;
```

---

## 🏗️ 3. Kiến trúc & Phân tầng (Layered Architecture)

### Luồng xử lý request chuẩn:

```
Route → Middleware(s) → Controller → Service → Model/DB
```

### Nguyên tắc:

| Tầng           | Trách nhiệm                                                              |
| -------------- | ------------------------------------------------------------------------ |
| **Route**      | Chỉ định nghĩa endpoint, gắn middleware và controller. KHÔNG chứa logic. |
| **Middleware** | Xác thực (auth), phân quyền (role), validate input, rate limiting.       |
| **Controller** | Nhận request, gọi service, trả response. KHÔNG truy vấn DB trực tiếp.    |
| **Service**    | Chứa toàn bộ business logic, tương tác với Model/DB.                     |
| **Model**      | Định nghĩa Mongoose schema, virtual, methods, statics.                   |
| **Utils**      | Hàm tiện ích thuần túy, không phụ thuộc vào request/response.            |

### Ví dụ Route:

```typescript
// src/routes/postRoutes.ts
import { Router } from 'express';
import { authenticate } from '@/middlewares/authMiddleware';
import {
  createPost,
  getPosts,
  getPostById,
} from '@/controllers/postController';

const router = Router();

router.post('/', authenticate, createPost);
router.get('/', getPosts);
router.get('/:id', getPostById);

export default router;
```

### Ví dụ Controller (mỏng — chỉ điều phối):

```typescript
// src/controllers/postController.ts
import { Request, Response, NextFunction } from 'express';
import * as postService from '@/services/postService';

export const createPost = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const post = await postService.createPost(req.body, req.user.id);
    res.status(201).json({ success: true, data: post });
  } catch (error) {
    next(error);
  }
};
```

---

## 📐 4. TypeScript Rules

### Bắt buộc tuân thủ:

- **Bật strict mode** (`"strict": true` trong `tsconfig.json`) — ĐÃ BẬT ✅.
- **KHÔNG sử dụng `any`**. Thay bằng `unknown`, generic, hoặc type cụ thể.
- **Luôn khai báo return type** cho mọi function (trừ arrow function một dòng hiển nhiên).
- **Luôn khai báo type cho function parameters**.
- Sử dụng **path alias** `@/*` thay vì đường dẫn tương đối dài.

```typescript
// ✅ Đúng — dùng path alias
import { authenticate } from '@/middlewares/authMiddleware';
import Post from '@/models/Post';

// ❌ Sai — đường dẫn tương đối lồng nhau
import { authenticate } from '../../../middlewares/authMiddleware';
```

### Cấu hình TypeScript tham chiếu:

```jsonc
// tsconfig.json (đã cấu hình)
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "strict": true,
    "esModuleInterop": true,
    "baseUrl": "./src",
    "paths": { "@/*": ["*"] },
  },
}
```

---

## 🌐 5. API Design Conventions

### URL Naming:

- Sử dụng **kebab-case** và **danh từ số nhiều** cho resource.
- Prefix tất cả API với `/api`.

```
GET    /api/posts              — Lấy danh sách bài đăng
POST   /api/posts              — Tạo bài đăng mới
GET    /api/posts/:id          — Lấy chi tiết bài đăng
PUT    /api/posts/:id          — Cập nhật bài đăng
DELETE /api/posts/:id          — Xóa bài đăng

POST   /api/transactions       — Tạo giao dịch nhận thực phẩm
GET    /api/transactions/:id   — Chi tiết giao dịch
PUT    /api/transactions/:id/accept  — Chấp nhận giao dịch

POST   /api/auth/register      — Đăng ký
POST   /api/auth/login         — Đăng nhập
```

### Response Format chuẩn:

```typescript
// Thành công
{
  "success": true,
  "data": { ... },
  "message": "Tạo bài đăng thành công"
}

// Thành công với phân trang
{
  "success": true,
  "data": [ ... ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8
  }
}

// Lỗi
{
  "success": false,
  "message": "Không tìm thấy bài đăng",
  "errorCode": "POST_NOT_FOUND"
}
```

### HTTP Status Code sử dụng:

| Code  | Ý nghĩa               | Khi nào dùng                         |
| ----- | --------------------- | ------------------------------------ |
| `200` | OK                    | GET, PUT thành công                  |
| `201` | Created               | POST tạo mới thành công              |
| `204` | No Content            | DELETE thành công                    |
| `400` | Bad Request           | Dữ liệu đầu vào không hợp lệ         |
| `401` | Unauthorized          | Chưa đăng nhập / token hết hạn       |
| `403` | Forbidden             | Không có quyền truy cập              |
| `404` | Not Found             | Resource không tồn tại               |
| `409` | Conflict              | Trùng lặp dữ liệu (email đã tồn tại) |
| `500` | Internal Server Error | Lỗi server không xác định            |

---

## 🗄️ 6. Mongoose Model Conventions

### Schema Definition:

```typescript
// src/models/Post.ts
import mongoose, { Schema, Document } from 'mongoose';

// 1. Interface cho document
export interface IPost extends Document {
  donor: mongoose.Types.ObjectId;
  title: string;
  description: string;
  images: string[];
  quantity: number;
  unit: string;
  expiryDate: Date;
  pickupAddress: string;
  location: {
    type: 'Point';
    coordinates: [number, number]; // [longitude, latitude]
  };
  status: 'available' | 'reserved' | 'completed' | 'expired';
  createdAt: Date;
  updatedAt: Date;
}

// 2. Schema definition
const postSchema = new Schema<IPost>(
  {
    donor: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, required: true, trim: true },
    // ...
  },
  {
    timestamps: true, // Tự động tạo createdAt, updatedAt
    versionKey: false, // Bỏ trường __v
  }
);

// 3. Indexes
postSchema.index({ status: 1, createdAt: -1 });
postSchema.index({ location: '2dsphere' });

// 4. Export model
export default mongoose.model<IPost>('Post', postSchema);
```

### Quy tắc:

- Mỗi file model **chỉ chứa 1 model duy nhất**.
- Tên Model (PascalCase, số ít): `User`, `Post`, `Transaction`.
- Luôn bật **`timestamps: true`** để tự động quản lý `createdAt`/`updatedAt`.
- Đặt **`versionKey: false`** trừ khi cần optimistic locking.
- Khai báo **indexes** cho các trường thường xuyên query/filter.
- Sử dụng **`ref`** cho các quan hệ giữa các collection (populate).

---

## 🔒 7. Xác thực & Phân quyền (Authentication & Authorization)

### Quy tắc:

- Sử dụng **JWT (Bearer Token)** cho xác thực.
- Token được gửi qua header: `Authorization: Bearer <token>`.
- **KHÔNG BAO GIỜ** lưu trữ plain-text password. Luôn dùng `bcryptjs` để hash.
- Secret keys (`JWT_SECRET`, `MONGODB_URI`) **CHỈ** được đặt trong file `.env`, KHÔNG hardcode.
- File `.env` **PHẢI** nằm trong `.gitignore`.

### Middleware Pattern:

```typescript
// src/middlewares/authMiddleware.ts
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export const authenticate = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    res
      .status(401)
      .json({ success: false, message: 'Token không được cung cấp' });
    return;
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string);
    req.user = decoded;
    next();
  } catch (error) {
    res
      .status(401)
      .json({ success: false, message: 'Token không hợp lệ hoặc đã hết hạn' });
  }
};

// Middleware phân quyền theo role
export const authorize = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!roles.includes(req.user.role)) {
      res
        .status(403)
        .json({ success: false, message: 'Bạn không có quyền truy cập' });
      return;
    }
    next();
  };
};
```

---

## ⚠️ 8. Xử lý lỗi (Error Handling)

### Custom Error Class:

```typescript
// src/utils/AppError.ts
export class AppError extends Error {
  public statusCode: number;
  public errorCode: string;
  public isOperational: boolean;

  constructor(message: string, statusCode: number, errorCode: string) {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}
```

### Global Error Handler Middleware:

```typescript
// src/middlewares/errorMiddleware.ts
import { Request, Response, NextFunction } from 'express';
import { AppError } from '@/utils/AppError';

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
      errorCode: err.errorCode,
    });
    return;
  }

  console.error('❌ Unexpected Error:', err);
  res.status(500).json({
    success: false,
    message: 'Đã xảy ra lỗi từ phía server',
    errorCode: 'INTERNAL_SERVER_ERROR',
  });
};
```

### Quy tắc:

- **Mọi async controller** đều phải dùng `try-catch` hoặc wrapper `asyncHandler`.
- **KHÔNG** dùng `throw` trong controller rồi không catch.
- Lỗi nghiệp vụ dùng `AppError`, lỗi hệ thống để global handler xử lý.
- **KHÔNG** trả về stack trace hoặc chi tiết lỗi hệ thống cho client ở production.

---

## ✅ 9. Validation

### Quy tắc:

- **Luôn validate** dữ liệu đầu vào (body, params, query) trước khi xử lý.
- Sử dụng thư viện validation (khuyến nghị **Zod** hoặc **Joi**).
- Validate tại tầng **middleware**, KHÔNG validate trong controller/service.

```typescript
// src/validations/postValidation.ts
import { z } from 'zod';

export const createPostSchema = z.object({
  title: z.string().min(5, 'Tiêu đề tối thiểu 5 ký tự').max(200),
  description: z.string().min(10, 'Mô tả tối thiểu 10 ký tự'),
  quantity: z.number().positive('Số lượng phải lớn hơn 0'),
  unit: z.string().min(1),
  expiryDate: z.string().datetime('Ngày hết hạn không hợp lệ'),
  pickupAddress: z.string().min(5, 'Địa chỉ nhận không hợp lệ'),
});

export type CreatePostInput = z.infer<typeof createPostSchema>;
```

---

## 🔌 10. Socket.io Conventions

### Quy tắc:

- Tách logic socket ra file riêng: `src/sockets/` hoặc `src/socket.ts`.
- Event name sử dụng **camelCase** và mô tả rõ hành động.
- Luôn xác thực user trước khi cho phép kết nối socket.

```typescript
// Tên event chuẩn
'sendMessage'; // Client gửi tin nhắn
'receiveMessage'; // Server phát tin nhắn
'newNotification'; // Server gửi thông báo mới
'joinRoom'; // Client tham gia phòng chat
'leaveRoom'; // Client rời phòng chat
'typing'; // Đang nhập tin nhắn
'stopTyping'; // Dừng nhập tin nhắn
```

---

## 📝 11. Quy tắc Comment & Documentation

### Code Comments:

- Viết comment bằng **tiếng Việt** hoặc **tiếng Anh** (chọn 1, nhất quán toàn dự án).
- Comment **WHY** (tại sao), không comment **WHAT** (cái gì) khi code đã rõ ràng.
- Sử dụng **JSDoc** cho public functions và interfaces quan trọng.

```typescript
/**
 * Tạo bài đăng chia sẻ thực phẩm mới.
 * Tự động gán trạng thái 'available' và cộng điểm cho người đăng.
 *
 * @param data - Dữ liệu bài đăng từ request body
 * @param donorId - ID của người dùng đăng bài
 * @returns Bài đăng vừa tạo
 * @throws AppError nếu thông tin không hợp lệ
 */
export async function createPost(
  data: CreatePostInput,
  donorId: string
): Promise<IPost> {
  // Cộng điểm thưởng vì policy khuyến khích chia sẻ (ref: PRD v2.3)
  await addRewardPoints(donorId, POINT_REWARD_PER_SHARE);
  // ...
}
```

---

## 🔀 12. Git & Version Control Conventions

### Branch Naming:

```
main              — Production-ready code
develop           — Integration branch
feature/<tên>     — Tính năng mới       (feature/food-post-crud)
fix/<tên>         — Sửa lỗi             (fix/auth-token-expiry)
hotfix/<tên>      — Sửa lỗi khẩn cấp   (hotfix/payment-crash)
refactor/<tên>    — Tái cấu trúc code   (refactor/controller-service-split)
```

### Commit Message Format (Conventional Commits):

```
<type>(<scope>): <mô tả ngắn gọn>

Ví dụ:
feat(post): thêm API tạo bài đăng thực phẩm
fix(auth): sửa lỗi token hết hạn không trả về 401
refactor(transaction): tách business logic sang service layer
docs(readme): cập nhật hướng dẫn cài đặt
chore(deps): cập nhật mongoose lên v9.3.1
```

| Type       | Ý nghĩa                               |
| ---------- | ------------------------------------- |
| `feat`     | Tính năng mới                         |
| `fix`      | Sửa lỗi                               |
| `refactor` | Tái cấu trúc (không thêm/sửa feature) |
| `docs`     | Thay đổi documentation                |
| `chore`    | Cập nhật config, deps, scripts        |
| `test`     | Thêm/sửa test cases                   |
| `style`    | Format code (không ảnh hưởng logic)   |

---

## 🧹 13. Code Style & Formatting

### Quy tắc chung:

- **Indent:** 2 spaces (KHÔNG dùng tab).
- **Quotes:** Single quotes (`'`) cho string.
- **Semicolons:** CÓ dấu chấm phẩy cuối câu lệnh.
- **Trailing comma:** Có dấu phẩy ở phần tử cuối cùng của object/array.
- **Max line length:** 100 ký tự.
- **Blank lines:** 1 dòng trống giữa các function/block logic.
- **Import order:**
  1. Node.js built-in modules (`http`, `path`, `fs`)
  2. External packages (`express`, `mongoose`, `jsonwebtoken`)
  3. Internal modules với path alias (`@/controllers/...`, `@/models/...`)

```typescript
// ✅ Import đúng thứ tự
import { createServer } from 'http';

import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';

import authRoutes from '@/routes/authRoutes';
import { authenticate } from '@/middlewares/authMiddleware';
import User from '@/models/User';
```

---

## 🌍 14. Environment Variables

### Quy tắc:

- **KHÔNG BAO GIỜ** commit file `.env` lên repository.
- Cung cấp file `.env.example` với tất cả biến (không có giá trị thật).
- Đặt tên biến theo **UPPER_SNAKE_CASE**.
- Luôn validate sự tồn tại của biến môi trường khi khởi động server.

```bash
# .env.example
PORT=5000
MONGODB_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/foodshare
JWT_SECRET=your_jwt_secret_here
JWT_EXPIRY=7d
NODE_ENV=development
SOCKET_CORS_ORIGIN=*
```

---

## 🧪 15. Testing Conventions

### Quy tắc:

- File test đặt cạnh file source hoặc trong thư mục `__tests__/`.
- Đặt tên: `<tên-file>.spec.ts` hoặc `<tên-file>.test.ts`.
- Mỗi service/controller nên có unit test tương ứng.
- Sử dụng **Jest** hoặc **Vitest** làm test runner.

```
src/
├── services/
│   ├── postService.ts
│   └── postService.spec.ts    # Unit test cho postService
```

---

## 🚫 16. Anti-Patterns (KHÔNG ĐƯỢC LÀM)

| ❌ Anti-Pattern                           | ✅ Cách đúng                                      |
| ----------------------------------------- | ------------------------------------------------- |
| Dùng `any` type                           | Khai báo type cụ thể hoặc `unknown`               |
| Viết business logic trong route file      | Tách ra controller → service                      |
| Hardcode secret/password trong code       | Dùng `process.env` + file `.env`                  |
| Không catch async errors                  | Dùng `try-catch` hoặc `asyncHandler` wrapper      |
| `console.log` để debug ở production       | Dùng logging library (winston/pino)               |
| Trả về stack trace cho client             | Chỉ trả message thân thiện, log chi tiết ở server |
| Không validate input                      | Validate ở middleware trước khi xử lý             |
| Import bằng relative path dài `../../../` | Dùng path alias `@/...`                           |
| Một file chứa nhiều model/controller      | Mỗi file chỉ chứa 1 responsibility                |
| Commit file `.env` hoặc `node_modules/`   | Đảm bảo `.gitignore` đầy đủ                       |

---

## 📋 Checklist trước khi Push Code

- [ ] Code không có lỗi TypeScript (`npx tsc --noEmit`).
- [ ] Không sử dụng `any` type.
- [ ] Tất cả function có khai báo return type.
- [ ] Input đã được validate.
- [ ] Async errors đã được handle.
- [ ] Không hardcode secrets/credentials.
- [ ] Import sử dụng path alias `@/...`.
- [ ] Commit message theo Conventional Commits format.
- [ ] Code đã format đúng (2 spaces, single quotes, semicolons).
- [ ] Không có `console.log` dùng cho debug còn sót.

---

> **📌 Ghi chú:** File này nên được review và cập nhật định kỳ khi dự án phát triển. Mọi thành viên trong team đều phải đọc và tuân thủ bộ quy tắc này.

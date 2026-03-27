# Quy Trình Phát Triển API (FoodShare Backend)

Tài liệu này mô tả quy trình chuẩn để xây dựng một API mới theo đúng convention của dự án.

## Tổng quan

Một API đầy đủ thường gồm 10 bước:

1. Xác định yêu cầu và contract API
2. Thiết kế data model và schema validation
3. Chuẩn bị middleware (auth, role, validation)
4. Viết business logic trong controller/service
5. Định tuyến route
6. Xử lý lỗi và chuẩn hóa response format
7. Viết unit test/integration test
8. Build, type-check và chạy test
9. Review code và security checks
10. Cập nhật tài liệu API

## Quy trình chi tiết

### 1) Xác định yêu cầu và contract API

- Làm rõ resource cần tạo (ví dụ: users, posts, transactions).
- Chốt endpoint, method và URL theo chuẩn: /api/<resource>.
- Chốt request format: body, params, query.
- Chốt response format: success, message, data, pagination (nếu có).
- Chốt role được phép truy cập endpoint.

Kết quả đầu ra:

- Danh sách endpoint + mô tả nghiệp vụ.
- Danh sách status code dự kiến (200, 201, 400, 401, 403, 404, 409, 500).

### 2) Thiết kế model và ràng buộc dữ liệu

- Nếu cần trường mới: cập nhật file model trong src/models.
- Đặt enum, default, required, index rõ ràng.
- Bật timestamps và khai báo index cho trường hay query.

Kết quả đầu ra:

- Model/schema hợp lệ và phù hợp nghiệp vụ.

### 3) Viết validation schema (Zod)

- Tạo file validation trong src/validations (ví dụ: userValidation.ts).
- Tách riêng schema cho create/update/filter nếu cần.
- Validate kỹ dữ liệu đầu vào: format email, min/max, enum, tuple location, ...
- Dùng refine/superRefine cho các rule liên trường.

Kết quả đầu ra:

- createXSchema, updateXSchema (và các schema khác nếu cần).

### 4) Chuẩn bị middleware

- Xác thực: verifyAuth.
- Phân quyền: verifyAdmin hoặc middleware role phù hợp.
- Validate body: validateBody(schema).
- Nếu cần: middleware validate params/query.

Kết quả đầu ra:

- Route được bảo vệ đúng quyền và đúng input.

### 5) Viết logic xử lý (controller/service)

- Controller nên mỏng: nhận request, gọi logic, trả response.
- Nếu logic phức tạp, tách sang service để dễ test và bảo trì.
- Kiểm tra các case quan trọng:
  - Not found
  - Duplicate (email/phone/...)
  - Permission denied
  - Invalid state transition
- Xử lý dữ liệu nhạy cảm (ví dụ: hash password, ẩn password khi trả về).

Kết quả đầu ra:

- CRUD đầy đủ và hành vi nghiệp vụ đúng theo yêu cầu.

### 6) Định nghĩa routes

- Tạo route file trong src/routes (ví dụ: userRoutes.ts).
- Gắn middleware theo đúng thứ tự:
  - verifyAuth
  - verifyAdmin (nếu cần)
  - validateBody(...)
  - controller
- Mount route trong src/server.ts với prefix /api.

Kết quả đầu ra:

- Endpoint có thể gọi được từ client theo đúng URL.

### 7) Chuẩn hóa response và error handling

- Thành công:
  - success: true
  - message
  - data
  - pagination (nếu là list)
- Lỗi:
  - success: false
  - message thân thiện
  - errorCode nếu cần
- Không trả stack trace cho client ở production.

Kết quả đầu ra:

- API response đồng nhất, frontend dễ tích hợp.

### 8) Viết test

Tối thiểu nên có:

- Unit test cho controller/service:
  - Success case
  - Validation fail
  - Unauthorized/Forbidden
  - Not found
  - Conflict
- Integration test route (nếu đã có setup):
  - Middleware + controller + status code + response shape.

Gợi ý đặt tên file:

- <feature>.spec.ts hoặc <feature>.test.ts

### 9) Tự kiểm tra trước khi push

- npm run build (hoặc tsc --noEmit) phải pass.
- npm test phải pass.
- Không dùng any nếu có thể tránh.
- Không hardcode secret.
- Kiểm tra import alias dùng @/...
- Kiểm tra route đã mount trong server.

### 10) Review và cập nhật tài liệu

- Review luồng nghiệp vụ và edge cases.
- Review security: auth, role, input validation.
- Cập nhật tài liệu endpoint và ví dụ request/response.
- Nếu thay đổi lớn, thêm migration note cho frontend/mobile.

## Definition of Done (DoD) cho một API mới

1. Có validation schema đầy đủ.
2. Có auth/authorization đúng vai trò.
3. Có CRUD/logic nghiệp vụ đúng theo mô tả.
4. Có route và mount server đúng.
5. Build pass.
6. Test pass (ít nhất cho case chính + case lỗi).
7. Response format đồng nhất với toàn hệ thống.
8. Được cập nhật tài liệu.

## Checklist nhanh trước merge

- [ ] Validation đã gắn cho create/update.
- [ ] Middleware auth và role đã đúng.
- [ ] Đã xử lý duplicate/not found/forbidden.
- [ ] Đã ẩn trường nhạy cảm trong response.
- [ ] Đã test status code và response shape.
- [ ] Đã build và test pass trên local.

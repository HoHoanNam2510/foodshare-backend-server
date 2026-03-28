import { Router } from 'express';
import {
  createPost,
  sendCreatePostPasscode,
  getMyPosts,
  updatePost,
  deletePost,
  getPostDetail,
  searchMapPosts,
  adminGetPosts,
  adminUpdatePost,
  adminToggleHidePost,
} from '../controllers/postController';
import {
  verifyAuth,
  verifyAdmin,
  optionalAuth,
} from '../middlewares/authMiddleware';
import { validateBody } from '../middlewares/validateBodyMiddleware';
import {
  createPostSchema,
  sendCreatePostPasscodeSchema,
  updatePostSchema,
  adminUpdatePostSchema,
} from '../validations/postValidation';

const router = Router();

// =============================================
// NHÓM ADMIN (yêu cầu đăng nhập + quyền Admin)
// Đặt trước /:id để tránh bị catch bởi param route
// =============================================

// [GET] /api/posts/admin
// (ADM_P01: Lấy danh sách toàn bộ bài đăng cho Dashboard)
router.get('/admin', verifyAuth, verifyAdmin, adminGetPosts);

// [PUT] /api/posts/admin/:id
// (ADM_P02: Admin sửa/duyệt bài đăng)
router.put(
  '/admin/:id',
  verifyAuth,
  verifyAdmin,
  validateBody(adminUpdatePostSchema),
  adminUpdatePost
);

// [PATCH] /api/posts/admin/:id/hide
// (ADM_P03: Admin ẩn bài đăng vi phạm)
router.patch('/admin/:id/hide', verifyAuth, verifyAdmin, adminToggleHidePost);

// =============================================
// NHÓM USER / STORE (yêu cầu đăng nhập)
// =============================================

// [POST] /api/posts/passcode/send
// (Gửi passcode xác thực tạo bài đăng qua email)
router.post(
  '/passcode/send',
  verifyAuth,
  validateBody(sendCreatePostPasscodeSchema),
  sendCreatePostPasscode
);

// [POST] /api/posts/
// (PST_F02: Tạo bài đăng chia sẻ/bán túi mù mới)
router.post('/', verifyAuth, validateBody(createPostSchema), createPost);

// [GET] /api/posts/me
// (PST_F01: Xem danh sách bài đăng gần đây của chính người dùng)
router.get('/me', verifyAuth, getMyPosts);

// [PUT] /api/posts/:id
// (PST_F03: Sửa thông tin bài đăng dựa theo ID)
router.put('/:id', verifyAuth, validateBody(updatePostSchema), updatePost);

// [DELETE] /api/posts/:id
// (PST_F04: Xóa bài đăng khỏi hệ thống dựa theo ID)
router.delete('/:id', verifyAuth, deletePost);

// =============================================
// NHÓM PUBLIC / TÌM KIẾM BẢN ĐỒ
// Đặt /map trước /:id để tránh bị catch
// =============================================

// [GET] /api/posts/map
// (PST_F05, MAP_F01-F03: Tìm bài đăng xung quanh vị trí GPS)
router.get('/map', searchMapPosts);

// [GET] /api/posts/:id
// (Xem chi tiết bài đăng — optionalAuth để kiểm tra owner khi bài ở trạng thái restricted)
router.get('/:id', optionalAuth, getPostDetail);

export default router;

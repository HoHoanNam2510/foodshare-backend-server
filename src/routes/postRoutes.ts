import { Router } from 'express';
import {
  createPost,
  sendCreatePostPasscode,
  getMyPosts,
  updatePost,
  deletePost,
  getNearbyPosts,
} from '../controllers/postController';
import { verifyAuth } from '../middlewares/authMiddleware';
import { validateBody } from '../middlewares/validateBodyMiddleware';
import {
  createPostSchema,
  sendCreatePostPasscodeSchema,
} from '../validations/postValidation';

const router = Router();

// [GET] /api/posts/nearby
// (PST_F05: Lấy tọa độ GPS và tìm bài đăng xung quanh)
router.get('/nearby', verifyAuth, getNearbyPosts);

// [POST] /api/posts/
// (PST_F02: Tạo bài đăng chia sẻ/bán túi mù mới)
router.post('/', verifyAuth, validateBody(createPostSchema), createPost);

// [POST] /api/posts/passcode/send
// (PST_F02: Gửi passcode xác thực tạo bài đăng qua email)
router.post(
  '/passcode/send',
  verifyAuth,
  validateBody(sendCreatePostPasscodeSchema),
  sendCreatePostPasscode
);

// [GET] /api/posts/me
// (PST_F01: Xem danh sách bài đăng gần đây của chính người dùng)
router.get('/me', verifyAuth, getMyPosts);

// [PUT] /api/posts/:id
// (PST_F03: Sửa thông tin bài đăng dựa theo ID)
router.put('/:id', verifyAuth, updatePost);

// [DELETE] /api/posts/:id
// (PST_F04: Xóa bài đăng khỏi hệ thống dựa theo ID)
router.delete('/:id', verifyAuth, deletePost);

export default router;

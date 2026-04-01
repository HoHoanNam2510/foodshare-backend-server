import { Router } from 'express';

import { verifyAuth } from '@/middlewares/authMiddleware';
import { uploadSingle, uploadMultiple } from '@/middlewares/uploadMiddleware';
import { validateBody } from '@/middlewares/validateBodyMiddleware';
import {
  deleteSingleImageSchema,
  deleteMultipleImagesSchema,
} from '@/validations/uploadValidation';
import {
  uploadSingleImage,
  uploadMultipleImagesHandler,
  deleteSingleImage,
  deleteMultipleImagesHandler,
} from '@/controllers/uploadController';

const router = Router();

// Upload một ảnh — POST /api/upload/single?folder=avatars
router.post('/single', verifyAuth, uploadSingle, uploadSingleImage);

// Upload nhiều ảnh — POST /api/upload/multiple?folder=posts
router.post(
  '/multiple',
  verifyAuth,
  uploadMultiple,
  uploadMultipleImagesHandler
);

// Xóa một ảnh — DELETE /api/upload/single  body: { url }
router.delete(
  '/single',
  verifyAuth,
  validateBody(deleteSingleImageSchema),
  deleteSingleImage
);

// Xóa nhiều ảnh — DELETE /api/upload/multiple  body: { urls }
router.delete(
  '/multiple',
  verifyAuth,
  validateBody(deleteMultipleImagesSchema),
  deleteMultipleImagesHandler
);

export default router;

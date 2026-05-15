import { Router } from 'express';
import {
  getMyTemplatesHandler,
  createTemplateHandler,
  updateTemplateHandler,
  deleteTemplateHandler,
} from '@/controllers/postTemplateController';
import { verifyAuth } from '@/middlewares/authMiddleware';
import { validateBody } from '@/middlewares/validateBodyMiddleware';
import {
  createPostTemplateSchema,
  updatePostTemplateSchema,
} from '@/validations/postTemplateValidation';

const router = Router();

// [GET] /api/post-templates/
router.get('/', verifyAuth, getMyTemplatesHandler);

// [POST] /api/post-templates/
router.post(
  '/',
  verifyAuth,
  validateBody(createPostTemplateSchema),
  createTemplateHandler
);

// [PUT] /api/post-templates/:id
router.put(
  '/:id',
  verifyAuth,
  validateBody(updatePostTemplateSchema),
  updateTemplateHandler
);

// [DELETE] /api/post-templates/:id
router.delete('/:id', verifyAuth, deleteTemplateHandler);

export default router;

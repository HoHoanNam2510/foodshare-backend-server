import express from 'express';
import { verifyAuth } from '@/middlewares/authMiddleware';
import { getMyStatisticsController } from '@/controllers/statisticsController';
import { statisticsQuerySchema } from '@/validations/statisticsValidation';
import { validateQuery } from '@/middlewares/validateRequestMiddleware';

const router = express.Router();

router.get(
  '/me',
  verifyAuth,
  validateQuery(statisticsQuerySchema),
  getMyStatisticsController
);

export default router;

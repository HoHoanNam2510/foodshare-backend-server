import { Request, Response, NextFunction } from 'express';
import { getMyStatistics } from '@/services/statisticsService';
import { StatisticsQuery } from '@/validations/statisticsValidation';
import logger from '@/utils/logger';

export async function getMyStatisticsController(
  req: Request,
  res: Response,
  _next: NextFunction
): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({
        success: false,
        message: 'Unauthorized',
        errorCode: 'UNAUTHORIZED',
      });
      return;
    }

    // Assumes validate middleware has attached parsed query to req.query
    const query = req.query as unknown as StatisticsQuery;
    const result = await getMyStatistics(user.id, user.role, query);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Statistics controller error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve statistics',
      errorCode: 'STATISTICS_FETCH_ERROR',
    });
  }
}

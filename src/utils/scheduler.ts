import cron from 'node-cron';

import SystemConfig from '@/models/SystemConfig';
import { runCleanup } from '@/services/softDeleteService';
import { runAIBatchModerationJob } from '@/services/postService';
import logger from '@/utils/logger';

async function runTrashCleanup(): Promise<void> {
  try {
    const config = await SystemConfig.findOne();
    const gracePeriodDays = config?.softDelete?.gracePeriodDays ?? 30;
    const schedule = config?.softDelete?.cleanupSchedule ?? 'BOTH';

    logger.info(
      `[Scheduler] Running trash cleanup (grace: ${gracePeriodDays}d)...`
    );
    const results = await runCleanup(gracePeriodDays);
    const total = results.reduce((sum, r) => sum + r.purgedCount, 0);
    logger.info(`[Scheduler] Trash cleanup done — purged ${total} records`);

    return void schedule;
  } catch (err) {
    logger.error('[Scheduler] Trash cleanup failed:', err);
  }
}

export function startScheduler(): void {
  // Chủ nhật 3:00 AM — dọn dẹp thùng rác cuối tuần
  cron.schedule('0 3 * * 0', async () => {
    const config = await SystemConfig.findOne();
    const schedule = config?.softDelete?.cleanupSchedule ?? 'BOTH';
    if (schedule === 'WEEKLY' || schedule === 'BOTH') {
      await runTrashCleanup();
    }
  });

  // Ngày 1 hàng tháng 3:00 AM — dọn dẹp thùng rác đầu tháng
  cron.schedule('0 3 1 * *', async () => {
    const config = await SystemConfig.findOne();
    const schedule = config?.softDelete?.cleanupSchedule ?? 'BOTH';
    if (schedule === 'MONTHLY' || schedule === 'BOTH') {
      await runTrashCleanup();
    }
  });

  // Mỗi 30 phút — kiểm tra và chạy AI batch moderation nếu đến interval
  cron.schedule('*/30 * * * *', async () => {
    try {
      const config = await SystemConfig.findOne();
      if (!config?.aiModeration?.enabled) return;

      const intervalMs = config.aiModeration.intervalHours * 60 * 60 * 1000;
      const lastRun = config.aiModeration.lastRunAt?.getTime() ?? 0;
      if (Date.now() - lastRun < intervalMs) return;

      logger.info('[Scheduler] AI batch moderation starting...');
      const stats = await runAIBatchModerationJob('BATCH_SCHEDULER');
      logger.info(`[Scheduler] AI moderation done — ${JSON.stringify(stats)}`);
    } catch (err) {
      logger.error('[Scheduler] AI batch moderation failed:', err);
    }
  });

  logger.info(
    '[Scheduler] Cron jobs started — trash cleanup (weekly Sun + monthly 1st at 3AM) + AI moderation (every 30min)'
  );
}

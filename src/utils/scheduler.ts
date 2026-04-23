import cron from 'node-cron';

import SystemConfig from '@/models/SystemConfig';
import { runCleanup } from '@/services/softDeleteService';
import logger from '@/utils/logger';

async function runTrashCleanup(): Promise<void> {
  try {
    const config = await SystemConfig.findOne();
    const gracePeriodDays = config?.softDelete?.gracePeriodDays ?? 30;
    const schedule = config?.softDelete?.cleanupSchedule ?? 'BOTH';

    logger.info(`[Scheduler] Running trash cleanup (grace: ${gracePeriodDays}d)...`);
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

  logger.info(
    '[Scheduler] Cron jobs started — trash cleanup (weekly Sun + monthly 1st at 3AM)'
  );
}

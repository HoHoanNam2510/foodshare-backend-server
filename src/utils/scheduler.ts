import cron from 'node-cron';

import Transaction from '@/models/Transaction';
import EscrowLedger from '@/models/EscrowLedger';
import Post from '@/models/Post';
import SystemConfig from '@/models/SystemConfig';
import { runCleanup } from '@/services/softDeleteService';
import logger from '@/utils/logger';

/**
 * Kiểm tra các đơn hàng ESCROWED đã quá hạn nhận hàng (pickupDeadline).
 * Nếu quá hạn → auto-cancel + hoàn tiền cho buyer.
 *
 * Theo proposal mục 4.1 trường hợp #4: Buyer no-show → giải ngân cho store.
 * Tuy nhiên, để demo an toàn, ta hoàn tiền cho buyer khi quá hạn.
 * Admin có thể xử lý thủ công nếu cần.
 */
async function checkPickupDeadlines(): Promise<void> {
  const now = new Date();

  // Tìm tất cả đơn ESCROWED đã quá hạn pickupDeadline
  const expiredOrders = await Transaction.find({
    type: 'ORDER',
    status: 'ESCROWED',
    pickupDeadline: { $lte: now },
  });

  if (expiredOrders.length === 0) return;

  logger.info(`[Scheduler] Found ${expiredOrders.length} expired ESCROWED orders`);

  for (const transaction of expiredOrders) {
    try {
      // Hoàn tiền qua cổng thanh toán
      const escrow = await EscrowLedger.findOne({
        transactionId: transaction._id,
        status: 'HOLDING',
      });

      // Đánh dấu escrow cần hoàn tiền — admin xử lý chuyển khoản thủ công
      if (escrow) {
        escrow.status = 'REFUNDED';
        escrow.refundedAt = now;
        escrow.refundReason = 'Quá hạn nhận hàng — tự động hoàn tiền';
        await escrow.save();
      }

      // Cập nhật trạng thái giao dịch
      transaction.status = 'REFUNDED';
      transaction.refundReason = 'Quá hạn nhận hàng — tự động hoàn tiền';
      transaction.refundedAt = now;
      await transaction.save();

      // Khôi phục tồn kho
      const post = await Post.findById(transaction.postId);
      if (post) {
        post.remainingQuantity += transaction.quantity;
        if (post.status === 'OUT_OF_STOCK') post.status = 'AVAILABLE';
        await post.save();
      }

      logger.info(`[Scheduler] Auto-refunded expired order`, {
        transactionId: transaction._id,
      });
    } catch (err) {
      logger.error('[Scheduler] Failed to process expired order', {
        transactionId: transaction._id,
        error: err instanceof Error ? err.message : err,
      });
    }
  }
}

/**
 * Kiểm tra các đơn hàng PENDING đã quá hạn thanh toán (expiredAt).
 * Nếu quá hạn → auto-cancel + khôi phục tồn kho.
 */
async function checkPaymentTimeouts(): Promise<void> {
  const now = new Date();

  const expiredPending = await Transaction.find({
    type: 'ORDER',
    status: 'PENDING',
    expiredAt: { $lte: now },
  });

  if (expiredPending.length === 0) return;

  logger.info(`[Scheduler] Found ${expiredPending.length} expired PENDING orders`);

  for (const transaction of expiredPending) {
    try {
      transaction.status = 'CANCELLED';
      await transaction.save();

      const post = await Post.findById(transaction.postId);
      if (post) {
        post.remainingQuantity += transaction.quantity;
        if (post.status === 'OUT_OF_STOCK') post.status = 'AVAILABLE';
        await post.save();
      }

      logger.info(`[Scheduler] Auto-cancelled expired PENDING order`, {
        transactionId: transaction._id,
      });
    } catch (err) {
      logger.error('[Scheduler] Failed to cancel expired PENDING order', {
        transactionId: transaction._id,
        error: err instanceof Error ? err.message : err,
      });
    }
  }
}

/**
 * Khởi chạy tất cả cron jobs.
 * Gọi hàm này sau khi kết nối MongoDB thành công.
 */
async function runTrashCleanup(): Promise<void> {
  try {
    const config = await SystemConfig.findOne();
    const gracePeriodDays = config?.softDelete?.gracePeriodDays ?? 30;
    const schedule = config?.softDelete?.cleanupSchedule ?? 'BOTH';

    logger.info(`[Scheduler] Running trash cleanup (grace: ${gracePeriodDays}d)...`);
    const results = await runCleanup(gracePeriodDays);
    const total = results.reduce((sum, r) => sum + r.purgedCount, 0);
    logger.info(`[Scheduler] Trash cleanup done — purged ${total} records`);

    return void schedule; // suppress unused variable warning
  } catch (err) {
    logger.error('[Scheduler] Trash cleanup failed:', err);
  }
}

export function startScheduler(): void {
  // Chạy mỗi 5 phút — kiểm tra pickup deadline
  cron.schedule('*/5 * * * *', async () => {
    logger.info('[Scheduler] Running pickup deadline check...');
    await checkPickupDeadlines();
  });

  // Chạy mỗi 2 phút — kiểm tra payment timeout
  cron.schedule('*/2 * * * *', async () => {
    logger.info('[Scheduler] Running payment timeout check...');
    await checkPaymentTimeouts();
  });

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
    '[Scheduler] Cron jobs started — pickup deadline (5min), payment timeout (2min), trash cleanup (weekly Sun + monthly 1st at 3AM)'
  );
}

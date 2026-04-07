import cron from 'node-cron';
import mongoose from 'mongoose';

import Transaction from '@/models/Transaction';
import EscrowLedger from '@/models/EscrowLedger';
import Post from '@/models/Post';
import { getPaymentService } from '@/services/payment';
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

      if (escrow && transaction.paymentTransId) {
        try {
          const gateway = transaction.paymentMethod as 'MOMO'; // TODO: Re-add | 'ZALOPAY' | 'VNPAY' when ready
          const paymentService = getPaymentService(gateway);
          await paymentService.refund({
            partnerTransId: transaction.paymentTransId,
            transactionId: (transaction._id as mongoose.Types.ObjectId).toString(),
            amount: transaction.totalAmount ?? 0,
            reason: 'Quá hạn nhận hàng — tự động hoàn tiền',
          });

          escrow.status = 'REFUNDED';
          escrow.refundedAt = now;
          escrow.refundReason = 'Quá hạn nhận hàng — tự động hoàn tiền';
          await escrow.save();
        } catch (refundErr) {
          logger.error('[Scheduler] Refund gateway failed', {
            transactionId: transaction._id,
            error: refundErr instanceof Error ? refundErr.message : refundErr,
          });
        }
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

  logger.info('[Scheduler] Cron jobs started — pickup deadline (5min), payment timeout (2min)');
}

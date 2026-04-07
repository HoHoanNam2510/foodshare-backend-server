import { Router, Request, Response } from 'express';

import { getPaymentService } from '@/services/payment';
import Transaction from '@/models/Transaction';
import EscrowLedger from '@/models/EscrowLedger';
import Post from '@/models/Post';
import logger from '@/utils/logger';

const router = Router();

// Hằng số phí platform (0% cho demo — điều chỉnh sau)
const PLATFORM_FEE_PERCENT = 0;

// ── Shared webhook processing logic ─────────────────────────────────────────

async function processPaymentWebhook(
  gateway: 'MOMO' | 'ZALOPAY' | 'VNPAY',
  transactionId: string,
  partnerTransId: string | undefined,
  amount: number
): Promise<void> {
  // Tìm transaction — phải đang PENDING
  const transaction = await Transaction.findOne({
    _id: transactionId,
    status: 'PENDING',
    type: 'ORDER',
  });

  if (!transaction) {
    logger.warn(`[Payment Webhook] ${gateway} — Transaction not found or not PENDING`, {
      transactionId,
    });
    return; // Idempotent — có thể đã xử lý trước đó
  }

  // Kiểm tra timeout — nếu quá hạn thì hủy
  if (transaction.expiredAt && new Date() > transaction.expiredAt) {
    transaction.status = 'CANCELLED';
    await transaction.save();

    const post = await Post.findById(transaction.postId);
    if (post) {
      post.remainingQuantity += transaction.quantity;
      if (post.status === 'OUT_OF_STOCK') post.status = 'AVAILABLE';
      await post.save();
    }

    logger.info(`[Payment Webhook] ${gateway} — Transaction expired, cancelled`, {
      transactionId,
    });
    return;
  }

  // Cập nhật transaction → ESCROWED
  const crypto = await import('crypto');
  const rawQrString = `${transaction._id}-${transaction.requesterId}-${crypto.randomBytes(4).toString('hex')}`;

  transaction.status = 'ESCROWED';
  transaction.paymentTransId = partnerTransId ?? undefined;
  transaction.verificationCode = rawQrString;

  // Set pickup deadline — 24 giờ sau thanh toán
  transaction.pickupDeadline = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await transaction.save();

  // Tạo EscrowLedger entry
  const platformFee = Math.round(
    (amount * PLATFORM_FEE_PERCENT) / 100
  );

  await EscrowLedger.create({
    transactionId: transaction._id,
    storeId: transaction.ownerId,
    buyerId: transaction.requesterId,
    amount,
    platformFee,
    netAmount: amount - platformFee,
    paymentMethod: gateway,
    paymentTransId: partnerTransId ?? '',
    status: 'HOLDING',
  });

  logger.info(`[Payment Webhook] ${gateway} payment processed, ESCROWED`, {
    transactionId,
    amount,
  });
}

// ── MoMo Webhook ────────────────────────────────────────────────────────────

/**
 * POST /api/payment/momo/webhook
 * MoMo IPN callback — public endpoint, xác thực bằng signature
 */
router.post('/momo/webhook', async (req: Request, res: Response) => {
  try {
    const momoService = getPaymentService('MOMO');
    const result = momoService.verifyWebhook(req.body);

    if (!result.isValid) {
      logger.warn('[Payment Webhook] MoMo signature invalid');
      res.status(400).json({ message: 'Invalid signature' });
      return;
    }

    // resultCode === 0 nghĩa là thanh toán thành công
    if (result.resultCode !== 0) {
      logger.info('[Payment Webhook] MoMo payment not successful', {
        resultCode: result.resultCode,
        transactionId: result.transactionId,
      });
      res.status(204).send();
      return;
    }

    const { transactionId, partnerTransId, amount } = result;

    if (!transactionId) {
      logger.error('[Payment Webhook] Missing transactionId in MoMo extraData');
      res.status(400).json({ message: 'Missing transactionId' });
      return;
    }

    await processPaymentWebhook('MOMO', transactionId, partnerTransId, amount!);

    // MoMo expects HTTP 204 for successful IPN acknowledgment
    res.status(204).send();
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Webhook processing error';
    logger.error('[Payment Webhook] MoMo error', { error: message });
    res.status(500).json({ message });
  }
});

// ── ZaloPay Webhook (DISABLED — TODO: Re-enable when ZaloPay is ready) ─────
// router.post('/zalopay/webhook', async (req: Request, res: Response) => {
//   try {
//     const zalopayService = getPaymentService('ZALOPAY');
//     const result = zalopayService.verifyWebhook(req.body);
//     if (!result.isValid) {
//       logger.warn('[Payment Webhook] ZaloPay MAC invalid');
//       res.json({ return_code: -1, return_message: 'mac not equal' });
//       return;
//     }
//     const { transactionId, partnerTransId, amount } = result;
//     if (!transactionId) {
//       logger.error('[Payment Webhook] Missing transactionId in ZaloPay embed_data');
//       res.json({ return_code: -1, return_message: 'missing transactionId' });
//       return;
//     }
//     await processPaymentWebhook('ZALOPAY', transactionId, partnerTransId, amount!);
//     res.json({ return_code: 1, return_message: 'success' });
//   } catch (error: unknown) {
//     const message = error instanceof Error ? error.message : 'Webhook processing error';
//     logger.error('[Payment Webhook] ZaloPay error', { error: message });
//     res.json({ return_code: 0, return_message: message });
//   }
// });

// ── VNPay Webhook (DISABLED — TODO: Re-enable when VNPay is ready) ─────────
// router.get('/vnpay/webhook', async (req: Request, res: Response) => {
//   try {
//     const vnpayService = getPaymentService('VNPAY');
//     const result = vnpayService.verifyWebhook(req.query as Record<string, unknown>);
//     if (!result.isValid) {
//       res.json({ RspCode: '97', Message: 'Invalid Checksum' });
//       return;
//     }
//     if (result.resultCode !== 0) {
//       res.json({ RspCode: '00', Message: 'Confirm Success' });
//       return;
//     }
//     const { transactionId, partnerTransId, amount } = result;
//     if (!transactionId) {
//       res.json({ RspCode: '01', Message: 'Order not found' });
//       return;
//     }
//     await processPaymentWebhook('VNPAY', transactionId, partnerTransId, amount!);
//     res.json({ RspCode: '00', Message: 'Confirm Success' });
//   } catch (error: unknown) {
//     const message = error instanceof Error ? error.message : 'Webhook processing error';
//     res.json({ RspCode: '99', Message: message });
//   }
// });

// ── VNPay Return URL (DISABLED — TODO: Re-enable when VNPay is ready) ──────
// router.get('/vnpay/return', async (req: Request, res: Response) => {
//   try {
//     const vnpayService = getPaymentService('VNPAY');
//     const result = vnpayService.verifyWebhook(req.query as Record<string, unknown>);
//     const status = result.isValid && result.resultCode === 0 ? 'success' : 'failed';
//     const transactionId = result.transactionId ?? '';
//     const deepLink = `foodsharemobileapp://payment-result?transactionId=${transactionId}&status=${status}`;
//     res.redirect(deepLink);
//   } catch {
//     res.redirect('foodsharemobileapp://payment-result?status=failed');
//   }
// });

// ── Initiate Payment ────────────────────────────────────────────────────────

/**
 * POST /api/payment/initiate
 * Buyer gọi endpoint này sau khi createOrder → nhận payUrl để redirect
 */
router.post('/initiate', async (req: Request, res: Response) => {
  try {
    const { transactionId, returnUrl } = req.body;

    const transaction = await Transaction.findOne({
      _id: transactionId,
      status: 'PENDING',
      type: 'ORDER',
    });

    if (!transaction) {
      res.status(404).json({
        success: false,
        message: 'Đơn hàng không tồn tại hoặc đã được xử lý',
      });
      return;
    }

    // Kiểm tra timeout
    if (transaction.expiredAt && new Date() > transaction.expiredAt) {
      transaction.status = 'CANCELLED';
      await transaction.save();
      res.status(400).json({
        success: false,
        message: 'Đơn hàng đã hết hạn thanh toán',
      });
      return;
    }

    const gateway = transaction.paymentMethod as 'MOMO'; // TODO: Re-add | 'ZALOPAY' | 'VNPAY' when ready
    const paymentService = getPaymentService(gateway);

    const baseUrl = process.env.BASE_URL ?? `http://localhost:${process.env.PORT ?? 5000}`;

    // Currently only MoMo is active — deep-link return
    // TODO: Re-add VNPay returnUrl logic when VNPay is ready
    const defaultReturnUrl = `foodsharemobileapp://payment-result?transactionId=${transaction._id}`;

    const notifyUrl = `${baseUrl}/api/payment/${gateway.toLowerCase()}/webhook`;

    const result = await paymentService.createPayment({
      transactionId: transaction._id.toString(),
      amount: transaction.totalAmount ?? 0,
      orderInfo: `FoodShare - Thanh toán đơn hàng #${transaction._id.toString().slice(-8)}`,
      returnUrl: returnUrl ?? defaultReturnUrl,
      notifyUrl,
    });

    // Lưu paymentTransId vào transaction
    transaction.paymentTransId = result.partnerTransId;
    await transaction.save();

    res.status(200).json({
      success: true,
      data: {
        payUrl: result.payUrl,
        partnerTransId: result.partnerTransId,
      },
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Lỗi khởi tạo thanh toán';
    res.status(500).json({ success: false, message });
  }
});

export default router;

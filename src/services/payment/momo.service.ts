import crypto from 'crypto';

import type {
  IPaymentService,
  CreatePaymentParams,
  CreatePaymentResult,
  RefundParams,
  RefundResult,
  WebhookVerifyResult,
} from './index';
import logger from '@/utils/logger';

// ── Env config ──────────────────────────────────────────────────────────────

const MOMO_PARTNER_CODE = process.env.MOMO_PARTNER_CODE ?? '';
const MOMO_ACCESS_KEY = process.env.MOMO_ACCESS_KEY ?? '';
const MOMO_SECRET_KEY = process.env.MOMO_SECRET_KEY ?? '';
const MOMO_API_ENDPOINT =
  process.env.MOMO_API_ENDPOINT ?? 'https://test-payment.momo.vn';

// ── Helpers ─────────────────────────────────────────────────────────────────

function createHmacSignature(rawData: string): string {
  return crypto
    .createHmac('sha256', MOMO_SECRET_KEY)
    .update(rawData)
    .digest('hex');
}

// ── Service implementation ──────────────────────────────────────────────────

export const momoPaymentService: IPaymentService = {
  gatewayName: 'MOMO',

  /**
   * MoMo Collection API v2 — Tạo yêu cầu thanh toán
   * Docs: https://developers.momo.vn/v3/docs/payment/api/payment-api/create
   */
  async createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult> {
    const {
      transactionId,
      amount,
      orderInfo,
      returnUrl,
      notifyUrl,
    } = params;

    const requestId = `${transactionId}-${Date.now()}`;
    const orderId = `FS-${transactionId}-${Date.now()}`;
    const requestType = 'payWithMethod';
    const extraData = Buffer.from(
      JSON.stringify({ transactionId })
    ).toString('base64');

    // Chuỗi raw để ký theo spec MoMo v2
    const rawSignature = [
      `accessKey=${MOMO_ACCESS_KEY}`,
      `amount=${amount}`,
      `extraData=${extraData}`,
      `ipnUrl=${notifyUrl}`,
      `orderId=${orderId}`,
      `orderInfo=${orderInfo}`,
      `partnerCode=${MOMO_PARTNER_CODE}`,
      `redirectUrl=${returnUrl}`,
      `requestId=${requestId}`,
      `requestType=${requestType}`,
    ].join('&');

    const signature = createHmacSignature(rawSignature);

    const body = {
      partnerCode: MOMO_PARTNER_CODE,
      partnerName: 'FoodShare',
      storeId: MOMO_PARTNER_CODE,
      requestId,
      amount,
      orderId,
      orderInfo,
      redirectUrl: returnUrl,
      ipnUrl: notifyUrl,
      lang: 'vi',
      requestType,
      autoCapture: true,
      extraData,
      signature,
    };

    logger.info('[MoMo] Creating payment', { orderId, amount, transactionId });

    const response = await fetch(
      `${MOMO_API_ENDPOINT}/v2/gateway/api/create`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    );
    const data = await response.json();

    if (data.resultCode !== 0) {
      logger.error('[MoMo] Create payment failed', {
        resultCode: data.resultCode,
        message: data.message,
      });
      throw new Error(`MoMo payment creation failed: ${data.message}`);
    }

    return {
      payUrl: data.payUrl,
      partnerTransId: orderId,
    };
  },

  /**
   * Xác minh IPN webhook từ MoMo
   * MoMo gửi POST với body chứa signature cần verify
   */
  verifyWebhook(payload: Record<string, unknown>): WebhookVerifyResult {
    const {
      accessKey,
      amount,
      extraData,
      message,
      orderId,
      orderInfo,
      orderType,
      partnerCode,
      payType,
      requestId,
      responseTime,
      resultCode,
      signature,
      transId,
    } = payload as Record<string, string>;

    // Rebuild raw string theo đúng thứ tự MoMo spec
    const rawSignature = [
      `accessKey=${accessKey}`,
      `amount=${amount}`,
      `extraData=${extraData}`,
      `message=${message}`,
      `orderId=${orderId}`,
      `orderInfo=${orderInfo}`,
      `orderType=${orderType}`,
      `partnerCode=${partnerCode}`,
      `payType=${payType}`,
      `requestId=${requestId}`,
      `responseTime=${responseTime}`,
      `resultCode=${resultCode}`,
      `transId=${transId}`,
    ].join('&');

    const expectedSignature = createHmacSignature(rawSignature);
    const isValid = expectedSignature === signature;

    if (!isValid) {
      logger.warn('[MoMo] Webhook signature mismatch', { orderId });
      return { isValid: false };
    }

    // Parse transactionId từ extraData
    let transactionId: string | undefined;
    try {
      const decoded = JSON.parse(
        Buffer.from(extraData as string, 'base64').toString('utf-8')
      );
      transactionId = decoded.transactionId;
    } catch {
      logger.warn('[MoMo] Failed to parse extraData', { extraData });
    }

    return {
      isValid: true,
      transactionId,
      partnerTransId: orderId as string,
      amount: Number(amount),
      resultCode: Number(resultCode),
    };
  },

  /**
   * MoMo Refund API v2
   */
  async refund(params: RefundParams): Promise<RefundResult> {
    const { partnerTransId, transactionId, amount, reason } = params;

    const requestId = `refund-${transactionId}-${Date.now()}`;

    const rawSignature = [
      `accessKey=${MOMO_ACCESS_KEY}`,
      `amount=${amount}`,
      `description=${reason}`,
      `orderId=${partnerTransId}`,
      `partnerCode=${MOMO_PARTNER_CODE}`,
      `requestId=${requestId}`,
      `transId=${partnerTransId}`,
    ].join('&');

    const signature = createHmacSignature(rawSignature);

    const body = {
      partnerCode: MOMO_PARTNER_CODE,
      orderId: partnerTransId,
      requestId,
      amount,
      transId: partnerTransId,
      lang: 'vi',
      description: reason,
      signature,
    };

    logger.info('[MoMo] Processing refund', {
      orderId: partnerTransId,
      amount,
      reason,
    });

    const response = await fetch(
      `${MOMO_API_ENDPOINT}/v2/gateway/api/refund`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    );
    const data = await response.json();

    if (data.resultCode !== 0) {
      logger.error('[MoMo] Refund failed', {
        resultCode: data.resultCode,
        message: data.message,
      });
      throw new Error(`MoMo refund failed: ${data.message}`);
    }

    return {
      success: true,
      refundId: data.transId ?? requestId,
    };
  },
};

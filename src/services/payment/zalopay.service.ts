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

const ZALOPAY_APP_ID = process.env.ZALOPAY_APP_ID ?? '';
const ZALOPAY_KEY1 = process.env.ZALOPAY_KEY1 ?? '';
const ZALOPAY_KEY2 = process.env.ZALOPAY_KEY2 ?? '';
const ZALOPAY_API_ENDPOINT =
  process.env.ZALOPAY_API_ENDPOINT ?? 'https://sb-openapi.zalopay.vn';

// ── Helpers ─────────────────────────────────────────────────────────────────

function hmacSha256(key: string, data: string): string {
  return crypto.createHmac('sha256', key).update(data).digest('hex');
}

/** Tạo app_trans_id theo format yymmdd_xxxxxxxx */
function generateAppTransId(transactionId: string): string {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const suffix = transactionId.slice(-8) + Date.now().toString().slice(-4);
  return `${yy}${mm}${dd}_${suffix}`;
}

// ── Service implementation ──────────────────────────────────────────────────

export const zalopayPaymentService: IPaymentService = {
  gatewayName: 'ZALOPAY',

  /**
   * ZaloPay Create Order API
   * Docs: https://docs.zalopay.vn/v2/general/overview.html
   */
  async createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult> {
    const { transactionId, amount, orderInfo, returnUrl, notifyUrl } = params;

    const appTransId = generateAppTransId(transactionId);
    const appTime = Date.now();

    const embedData = JSON.stringify({
      redirecturl: returnUrl,
      transactionId,
    });
    const item = JSON.stringify([
      { name: orderInfo, quantity: 1, amount },
    ]);

    // Mac = HMAC_SHA256(key1, app_id|app_trans_id|app_user|amount|app_time|embed_data|item)
    const rawMac = [
      ZALOPAY_APP_ID,
      appTransId,
      'FoodShareBuyer',
      amount,
      appTime,
      embedData,
      item,
    ].join('|');

    const mac = hmacSha256(ZALOPAY_KEY1, rawMac);

    const body = {
      app_id: Number(ZALOPAY_APP_ID),
      app_trans_id: appTransId,
      app_user: 'FoodShareBuyer',
      app_time: appTime,
      amount,
      item,
      embed_data: embedData,
      description: orderInfo,
      bank_code: '',
      callback_url: notifyUrl,
      mac,
    };

    logger.info('[ZaloPay] Creating payment', { appTransId, amount, transactionId });

    const response = await fetch(`${ZALOPAY_API_ENDPOINT}/v2/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json();

    if (data.return_code !== 1) {
      logger.error('[ZaloPay] Create payment failed', {
        return_code: data.return_code,
        return_message: data.return_message,
        sub_return_message: data.sub_return_message,
      });
      throw new Error(`ZaloPay payment creation failed: ${data.return_message}`);
    }

    return {
      payUrl: data.order_url,
      partnerTransId: appTransId,
    };
  },

  /**
   * Xác minh callback từ ZaloPay
   * ZaloPay gửi POST với body { data, mac, type }
   * mac = HMAC_SHA256(key2, data)
   */
  verifyWebhook(payload: Record<string, unknown>): WebhookVerifyResult {
    const { data: dataStr, mac } = payload as { data: string; mac: string };

    // Verify MAC using key2
    const expectedMac = hmacSha256(ZALOPAY_KEY2, dataStr);
    const isValid = expectedMac === mac;

    if (!isValid) {
      logger.warn('[ZaloPay] Webhook MAC mismatch');
      return { isValid: false };
    }

    // Parse data JSON string
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(dataStr);
    } catch {
      logger.warn('[ZaloPay] Failed to parse callback data');
      return { isValid: false };
    }

    // Extract transactionId from embed_data
    let transactionId: string | undefined;
    try {
      const embedData = JSON.parse(parsed.embed_data as string);
      transactionId = embedData.transactionId;
    } catch {
      logger.warn('[ZaloPay] Failed to parse embed_data');
    }

    return {
      isValid: true,
      transactionId,
      partnerTransId: parsed.app_trans_id as string,
      amount: Number(parsed.amount),
      resultCode: 1, // ZaloPay callback only fires on success
    };
  },

  /**
   * ZaloPay Refund API
   * Docs: https://docs.zalopay.vn/v2/general/overview.html#refund
   */
  async refund(params: RefundParams): Promise<RefundResult> {
    const { partnerTransId, amount, reason } = params;

    const timestamp = Date.now();
    const uid = `${timestamp}${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
    const mRefundId = `${new Date().toISOString().slice(0, 10).replace(/-/g, '')}_${ZALOPAY_APP_ID}_${uid}`;

    // mac = HMAC_SHA256(key1, app_id|zp_trans_id|amount|description|timestamp)
    const rawMac = [
      ZALOPAY_APP_ID,
      partnerTransId,
      amount,
      reason,
      timestamp,
    ].join('|');

    const mac = hmacSha256(ZALOPAY_KEY1, rawMac);

    const body = {
      app_id: Number(ZALOPAY_APP_ID),
      zp_trans_id: partnerTransId,
      m_refund_id: mRefundId,
      amount,
      description: reason,
      timestamp,
      mac,
    };

    logger.info('[ZaloPay] Processing refund', {
      appTransId: partnerTransId,
      amount,
      reason,
    });

    const response = await fetch(`${ZALOPAY_API_ENDPOINT}/v2/refund`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json();

    if (data.return_code !== 1) {
      logger.error('[ZaloPay] Refund failed', {
        return_code: data.return_code,
        return_message: data.return_message,
      });
      throw new Error(`ZaloPay refund failed: ${data.return_message}`);
    }

    return {
      success: true,
      refundId: data.refund_id?.toString() ?? mRefundId,
    };
  },
};

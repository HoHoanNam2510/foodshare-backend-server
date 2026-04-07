import crypto from 'crypto';
import querystring from 'querystring';

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

const VNPAY_TMN_CODE = process.env.VNPAY_TMN_CODE ?? '';
const VNPAY_HASH_SECRET = process.env.VNPAY_HASH_SECRET ?? '';
const VNPAY_API_ENDPOINT =
  process.env.VNPAY_API_ENDPOINT ?? 'https://sandbox.vnpayment.vn';

// ── Helpers ─────────────────────────────────────────────────────────────────

function hmacSha512(secret: string, data: string): string {
  return crypto.createHmac('sha512', secret).update(data).digest('hex');
}

/** Sort object keys alphabetically and build query string */
function sortedQueryString(obj: Record<string, string | number>): string {
  const sorted = Object.keys(obj)
    .sort()
    .reduce(
      (acc, key) => {
        if (obj[key] !== '' && obj[key] !== undefined && obj[key] !== null) {
          acc[key] = String(obj[key]);
        }
        return acc;
      },
      {} as Record<string, string>
    );
  return querystring.stringify(sorted, '&', '=');
}

/** Format date as yyyyMMddHHmmss for VNPay */
function formatVnpDate(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return (
    date.getFullYear().toString() +
    pad(date.getMonth() + 1) +
    pad(date.getDate()) +
    pad(date.getHours()) +
    pad(date.getMinutes()) +
    pad(date.getSeconds())
  );
}

// ── Service implementation ──────────────────────────────────────────────────

export const vnpayPaymentService: IPaymentService = {
  gatewayName: 'VNPAY',

  /**
   * VNPay Create Payment URL
   * Docs: https://sandbox.vnpayment.vn/apis/docs/thanh-toan-pay/pay.html
   * VNPay does not use a REST API to create orders — instead we build a signed URL
   * and redirect the buyer to it.
   */
  async createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult> {
    const { transactionId, amount, orderInfo, returnUrl, notifyUrl } = params;

    const now = new Date();
    const createDate = formatVnpDate(now);
    const orderId = `FS${transactionId.slice(-8)}${Date.now().toString().slice(-6)}`;
    const expireDate = formatVnpDate(new Date(now.getTime() + 15 * 60 * 1000)); // 15 min

    const vnpParams: Record<string, string | number> = {
      vnp_Version: '2.1.0',
      vnp_Command: 'pay',
      vnp_TmnCode: VNPAY_TMN_CODE,
      vnp_Locale: 'vn',
      vnp_CurrCode: 'VND',
      vnp_TxnRef: orderId,
      vnp_OrderInfo: orderInfo,
      vnp_OrderType: 'other',
      vnp_Amount: amount * 100, // VNPay expects amount in smallest unit (VND * 100)
      vnp_ReturnUrl: returnUrl,
      vnp_IpAddr: '127.0.0.1',
      vnp_CreateDate: createDate,
      vnp_ExpireDate: expireDate,
    };

    // Sign
    const signData = sortedQueryString(vnpParams);
    const secureHash = hmacSha512(VNPAY_HASH_SECRET, signData);

    const payUrl =
      `${VNPAY_API_ENDPOINT}/paymentv2/vpcpay.html?${signData}` +
      `&vnp_SecureHash=${secureHash}`;

    logger.info('[VNPay] Creating payment URL', { orderId, amount, transactionId });

    return {
      payUrl,
      partnerTransId: orderId,
    };
  },

  /**
   * Xác minh IPN / Return URL từ VNPay
   * VNPay gửi GET (return) hoặc GET (IPN) với query params chứa vnp_SecureHash
   */
  verifyWebhook(payload: Record<string, unknown>): WebhookVerifyResult {
    const secureHash = payload.vnp_SecureHash as string;

    // Remove hash fields before verification
    const verifyParams = { ...payload };
    delete verifyParams.vnp_SecureHash;
    delete verifyParams.vnp_SecureHashType;

    const signData = sortedQueryString(
      verifyParams as Record<string, string | number>
    );
    const expectedHash = hmacSha512(VNPAY_HASH_SECRET, signData);
    const isValid = expectedHash === secureHash;

    if (!isValid) {
      logger.warn('[VNPay] Webhook hash mismatch');
      return { isValid: false };
    }

    const responseCode = payload.vnp_ResponseCode as string;
    const txnRef = payload.vnp_TxnRef as string;
    const amount = Number(payload.vnp_Amount) / 100; // Convert back from smallest unit

    // Extract transactionId from txnRef: FS<last8chars><6digits>
    // We stored transactionId in orderInfo instead — parse from vnp_OrderInfo
    let transactionId: string | undefined;
    const orderInfoStr = (payload.vnp_OrderInfo as string) ?? '';
    const match = orderInfoStr.match(/#([a-f0-9]+)$/i);
    if (match) {
      transactionId = match[1];
    }

    return {
      isValid: true,
      transactionId,
      partnerTransId: txnRef,
      amount,
      resultCode: responseCode === '00' ? 0 : Number(responseCode),
    };
  },

  /**
   * VNPay Refund API
   * Docs: https://sandbox.vnpayment.vn/apis/docs/thanh-toan-pay/refund.html
   */
  async refund(params: RefundParams): Promise<RefundResult> {
    const { partnerTransId, transactionId, amount, reason } = params;

    const now = new Date();
    const requestId = `refund-${transactionId}-${Date.now()}`;
    const createDate = formatVnpDate(now);

    const vnpParams: Record<string, string | number> = {
      vnp_RequestId: requestId,
      vnp_Version: '2.1.0',
      vnp_Command: 'refund',
      vnp_TmnCode: VNPAY_TMN_CODE,
      vnp_TransactionType: '02', // Full refund
      vnp_TxnRef: partnerTransId,
      vnp_Amount: amount * 100,
      vnp_OrderInfo: reason,
      vnp_TransactionNo: '',
      vnp_TransactionDate: createDate,
      vnp_CreateDate: createDate,
      vnp_CreateBy: 'FoodShare',
      vnp_IpAddr: '127.0.0.1',
    };

    // Refund signature: requestId|version|command|tmnCode|transType|txnRef|amount|transNo|transDate|createBy|createDate|ipAddr|orderInfo
    const rawHash = [
      vnpParams.vnp_RequestId,
      vnpParams.vnp_Version,
      vnpParams.vnp_Command,
      vnpParams.vnp_TmnCode,
      vnpParams.vnp_TransactionType,
      vnpParams.vnp_TxnRef,
      vnpParams.vnp_Amount,
      vnpParams.vnp_TransactionNo,
      vnpParams.vnp_TransactionDate,
      vnpParams.vnp_CreateBy,
      vnpParams.vnp_CreateDate,
      vnpParams.vnp_IpAddr,
      vnpParams.vnp_OrderInfo,
    ].join('|');

    const secureHash = hmacSha512(VNPAY_HASH_SECRET, rawHash);

    const body = {
      ...vnpParams,
      vnp_SecureHash: secureHash,
    };

    logger.info('[VNPay] Processing refund', {
      txnRef: partnerTransId,
      amount,
      reason,
    });

    const response = await fetch(
      `${VNPAY_API_ENDPOINT}/merchant_webapi/api/transaction`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    );
    const data = await response.json();

    if (data.vnp_ResponseCode !== '00') {
      logger.error('[VNPay] Refund failed', {
        responseCode: data.vnp_ResponseCode,
        message: data.vnp_Message,
      });
      throw new Error(`VNPay refund failed: ${data.vnp_Message ?? 'Unknown error'}`);
    }

    return {
      success: true,
      refundId: data.vnp_TransactionNo ?? requestId,
    };
  },
};

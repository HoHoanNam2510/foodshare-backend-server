import type {
  CreatePaymentParams,
  CreatePaymentResult,
  RefundParams,
  RefundResult,
  WebhookVerifyResult,
} from './types';

/**
 * Interface chung cho tất cả payment gateway (MoMo, ZaloPay, VNPay).
 * Mỗi gateway triển khai riêng — controller chỉ gọi qua interface này.
 */
export interface IPaymentService {
  /** Tên cổng thanh toán — dùng cho logging và routing */
  readonly gatewayName: 'MOMO' | 'ZALOPAY' | 'VNPAY'; // All gateways kept for interface compat; only MOMO is registered

  /** Tạo yêu cầu thanh toán → trả về URL redirect cho buyer */
  createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult>;

  /** Xác minh webhook/IPN callback từ cổng thanh toán */
  verifyWebhook(payload: Record<string, unknown>): WebhookVerifyResult;

  /** Hoàn tiền cho buyer */
  refund(params: RefundParams): Promise<RefundResult>;
}

/** Registry lưu các payment service đã đăng ký */
const registry = new Map<string, IPaymentService>();

/** Đăng ký một payment service implementation */
export function registerPaymentService(service: IPaymentService): void {
  registry.set(service.gatewayName, service);
}

/** Lấy payment service theo tên gateway — throw nếu chưa đăng ký */
export function getPaymentService(
  gateway: 'MOMO' // TODO: Re-add | 'ZALOPAY' | 'VNPAY' when ready
): IPaymentService {
  const service = registry.get(gateway);
  if (!service) {
    throw new Error(
      `Payment gateway "${gateway}" chưa được đăng ký. Kiểm tra lại cấu hình.`
    );
  }
  return service;
}

export type {
  CreatePaymentParams,
  CreatePaymentResult,
  RefundParams,
  RefundResult,
  WebhookVerifyResult,
};

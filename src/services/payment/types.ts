/** Yêu cầu tạo thanh toán gửi đến cổng */
export interface CreatePaymentParams {
  transactionId: string;
  amount: number;
  orderInfo: string;
  returnUrl: string;
  notifyUrl: string;
}

/** Kết quả tạo thanh toán — trả về URL redirect cho buyer */
export interface CreatePaymentResult {
  payUrl: string;
  partnerTransId: string;
}

/** Yêu cầu hoàn tiền */
export interface RefundParams {
  partnerTransId: string;
  transactionId: string;
  amount: number;
  reason: string;
}

/** Kết quả hoàn tiền */
export interface RefundResult {
  success: boolean;
  refundId: string;
}

/** Kết quả xác minh webhook — dữ liệu giao dịch đã xác thực */
export interface WebhookVerifyResult {
  isValid: boolean;
  transactionId?: string;
  partnerTransId?: string;
  amount?: number;
  resultCode?: number;
}

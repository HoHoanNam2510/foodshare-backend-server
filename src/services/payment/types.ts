/** Tham số sinh mã QR VietQR */
export interface GenerateQRParams {
  amount: number;
  description: string; // Nội dung chuyển khoản (mã đơn hàng)
}

/** Kết quả sinh QR — trả về ảnh QR và thông tin tài khoản */
export interface GenerateQRResult {
  qrDataURL: string;     // Base64 data URL của ảnh QR (data:image/png;base64,...)
  bankName: string;
  bankAccountNumber: string;
  bankAccountName: string;
  amount: number;
  description: string;
}

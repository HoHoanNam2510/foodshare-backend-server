/** Tham số sinh mã QR VietQR — caller tự truyền thông tin tài khoản ngân hàng */
export interface GenerateQRParams {
  bankCode: string;
  bankAccountNumber: string;
  bankAccountName: string;
  amount: number;
  description: string;
}

/** Kết quả sinh QR — trả về ảnh QR và thông tin tài khoản */
export interface GenerateQRResult {
  qrDataURL: string;
  bankAccountNumber: string;
  bankAccountName: string;
  amount: number;
  description: string;
}

import axios from 'axios';
import SystemConfig from '../../models/SystemConfig';
import type { GenerateQRParams, GenerateQRResult } from './types';

const VIETQR_API_URL = 'https://api.vietqr.io/v2/generate';

/**
 * Sinh mã QR chuyển khoản ngân hàng theo chuẩn VietQR.
 * Lấy thông tin tài khoản hệ thống từ SystemConfig (singleton).
 */
export async function generateVietQR(
  params: GenerateQRParams
): Promise<GenerateQRResult> {
  const config = await SystemConfig.findOne().lean();
  if (!config) {
    throw new Error(
      'Chưa cấu hình tài khoản ngân hàng hệ thống. Admin vui lòng vào Settings để thiết lập.'
    );
  }

  const { systemBankCode, systemBankAccountNumber, systemBankAccountName, systemBankName } =
    config;

  const payload = {
    accountNo: systemBankAccountNumber,
    accountName: systemBankAccountName,
    acqId: systemBankCode,         // Bank BIN/code theo chuẩn VietQR
    amount: params.amount,
    addInfo: params.description,   // Nội dung chuyển khoản
    format: 'text',
    template: 'compact',
  };

  const response = await axios.post(VIETQR_API_URL, payload, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 10000,
  });

  const data = response.data;
  if (data.code !== '00') {
    throw new Error(`VietQR API lỗi [${data.code}]: ${data.desc ?? 'Unknown error'} | payload: ${JSON.stringify(payload)}`);
  }

  // VietQR v2 trả về qrDataURL là base64 string (không kèm prefix)
  const rawQrDataURL: string = data.data?.qrDataURL ?? '';
  const qrDataURL = rawQrDataURL.startsWith('data:')
    ? rawQrDataURL
    : `data:image/png;base64,${rawQrDataURL}`;

  return {
    qrDataURL,
    bankName: systemBankName,
    bankAccountNumber: systemBankAccountNumber,
    bankAccountName: systemBankAccountName,
    amount: params.amount,
    description: params.description,
  };
}

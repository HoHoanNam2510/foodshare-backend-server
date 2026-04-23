import axios from 'axios';
import type { GenerateQRParams, GenerateQRResult } from './types';

const VIETQR_API_URL = 'https://api.vietqr.io/v2/generate';

export async function generateVietQR(
  params: GenerateQRParams
): Promise<GenerateQRResult> {
  const payload = {
    accountNo: params.bankAccountNumber,
    accountName: params.bankAccountName,
    acqId: params.bankCode,
    amount: params.amount,
    addInfo: params.description,
    format: 'text',
    template: 'compact',
  };

  const response = await axios.post(VIETQR_API_URL, payload, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 10000,
  });

  const data = response.data;
  if (data.code !== '00') {
    throw new Error(
      `VietQR API lỗi [${data.code}]: ${data.desc ?? 'Unknown error'} | payload: ${JSON.stringify(payload)}`
    );
  }

  const rawQrDataURL: string = data.data?.qrDataURL ?? '';
  const qrDataURL = rawQrDataURL.startsWith('data:')
    ? rawQrDataURL
    : `data:image/png;base64,${rawQrDataURL}`;

  return {
    qrDataURL,
    bankAccountNumber: params.bankAccountNumber,
    bankAccountName: params.bankAccountName,
    amount: params.amount,
    description: params.description,
  };
}

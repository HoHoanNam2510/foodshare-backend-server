// File này giữ lại để không phá vỡ import trong server.ts
// Route /api/payment đã được tích hợp vào transactionRoutes (/orders/:id/qr)
import { Router } from 'express';

const router = Router();

export default router;

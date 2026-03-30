/**
 * Script tạo dữ liệu mẫu cho Voucher, UserVoucher, PointLog.
 *
 * Cách chạy:
 *   npx ts-node -r tsconfig-paths/register src/seeds/seedVoucherAndPoints.ts
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';

import Voucher from '@/models/Voucher';
import UserVoucher from '@/models/UserVoucher';
import PointLog from '@/models/PointLog';
import User from '@/models/User';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI as string;

async function seed(): Promise<void> {
  await mongoose.connect(MONGODB_URI);
  console.log('✅ Kết nối MongoDB thành công');

  // --- Bước 1: Lấy hoặc tạo 2 user để seed ---
  let users = await User.find().limit(2).lean();

  if (users.length < 2) {
    console.log('⚠️  Không đủ 2 user, tự tạo user mẫu...');
    const bcrypt = await import('bcryptjs');
    const hashedPw = await bcrypt.hash('Test@1234', 10);

    const storeU = await User.create({
      email: 'store_seed@foodshare.vn',
      password: hashedPw,
      authProvider: 'LOCAL',
      isProfileCompleted: true,
      role: 'STORE',
      fullName: 'Cửa hàng GreenMart',
      greenPoints: 200,
      averageRating: 4.5,
      kycStatus: 'VERIFIED',
      storeInfo: {
        openHours: '07:00 - 21:00',
        description: 'Cửa hàng thực phẩm sạch',
        businessAddress: '123 Nguyễn Huệ, Q.1, TP.HCM',
      },
    });
    const normalU = await User.create({
      email: 'user_seed@foodshare.vn',
      password: hashedPw,
      authProvider: 'LOCAL',
      isProfileCompleted: true,
      role: 'USER',
      fullName: 'Trần Minh Tú',
      greenPoints: 50,
      averageRating: 4.0,
      kycStatus: 'VERIFIED',
    });
    users = [storeU.toObject(), normalU.toObject()];
    console.log('✅ Đã tạo 2 user mẫu');
  }

  const storeUser = users.find((u) => u.role === 'STORE') || users[0];
  const normalUser =
    users.find((u) => u._id.toString() !== storeUser._id.toString()) ||
    users[1];

  console.log(`👤 Store user: ${storeUser.fullName} (${storeUser._id})`);
  console.log(`👤 Normal user: ${normalUser.fullName} (${normalUser._id})`);

  // --- Bước 2: Tạo 2 Voucher ---
  const now = new Date();
  const oneMonthLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const voucher1 = await Voucher.create({
    creatorId: storeUser._id,
    code: 'FREESHIP50',
    title: 'Giảm 50% phí vận chuyển',
    description: 'Áp dụng cho đơn hàng túi mù từ 50.000đ trở lên',
    discountType: 'PERCENTAGE',
    discountValue: 50,
    pointCost: 20,
    totalQuantity: 100,
    remainingQuantity: 98,
    validFrom: now,
    validUntil: oneMonthLater,
    isActive: true,
  });
  console.log(`🎫 Voucher 1 created: ${voucher1.code} (${voucher1._id})`);

  const voucher2 = await Voucher.create({
    creatorId: storeUser._id,
    code: 'SAVE10K',
    title: 'Giảm 10.000đ cho đơn tiếp theo',
    description: 'Không giới hạn loại đơn hàng',
    discountType: 'FIXED_AMOUNT',
    discountValue: 10000,
    pointCost: 15,
    totalQuantity: 50,
    remainingQuantity: 50,
    validFrom: now,
    validUntil: oneMonthLater,
    isActive: true,
  });
  console.log(`🎫 Voucher 2 created: ${voucher2.code} (${voucher2._id})`);

  // --- Bước 3: Tạo 2 UserVoucher (normalUser đã đổi voucher1) ---
  const userVoucher1 = await UserVoucher.create({
    userId: normalUser._id,
    voucherId: voucher1._id,
    status: 'UNUSED',
  });
  console.log(`🎒 UserVoucher 1 (UNUSED): ${userVoucher1._id}`);

  const userVoucher2 = await UserVoucher.create({
    userId: normalUser._id,
    voucherId: voucher1._id,
    status: 'USED',
    usedAt: new Date(),
  });
  console.log(`🎒 UserVoucher 2 (USED): ${userVoucher2._id}`);

  // --- Bước 4: Tạo 2 PointLog ---
  const pointLog1 = await PointLog.create({
    userId: normalUser._id,
    amount: 10,
    reason: 'Hoàn tất giao dịch P2P — Người chia sẻ',
    referenceId: new mongoose.Types.ObjectId(),
  });
  console.log(`📊 PointLog 1 (+10 điểm): ${pointLog1._id}`);

  const pointLog2 = await PointLog.create({
    userId: normalUser._id,
    amount: -20,
    reason: 'Đổi điểm lấy Voucher FREESHIP50',
    referenceId: voucher1._id,
  });
  console.log(`📊 PointLog 2 (-20 điểm): ${pointLog2._id}`);

  console.log('\n🎉 Seed dữ liệu mẫu thành công!');
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('❌ Seed thất bại:', err);
  process.exit(1);
});

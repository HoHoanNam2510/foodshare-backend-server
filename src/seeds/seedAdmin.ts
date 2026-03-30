/**
 * Script tạo tài khoản Admin mặc định.
 *
 * Cách chạy:
 *   npx ts-node -r tsconfig-paths/register src/seeds/seedAdmin.ts
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '@/models/User';
import { hashPassword } from '@/utils/auth';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI as string;

async function seed(): Promise<void> {
  await mongoose.connect(MONGODB_URI);
  console.log('✅ Kết nối MongoDB thành công');

  const email = 'nam123@gmail.com';

  const existing = await User.findOne({ email });
  if (existing) {
    console.log('⚠️  Admin đã tồn tại, bỏ qua.');
    await mongoose.disconnect();
    return;
  }

  const hashedPw = await hashPassword('123456');

  const admin = await User.create({
    email,
    password: hashedPw,
    fullName: 'Admin',
    role: 'ADMIN',
    authProvider: 'LOCAL',
    isProfileCompleted: true,
    status: 'ACTIVE',
  });

  console.log('✅ Tạo admin thành công:', admin.email);
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('❌ Lỗi seed admin:', err);
  process.exit(1);
});

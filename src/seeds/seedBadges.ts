/**
 * Seed Script: Upload badge images to Cloudinary + seed Badge documents to MongoDB.
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register src/seeds/seedBadges.ts
 *
 * Requires: .env with CLOUDINARY_* and MONGODB_URI configured.
 *
 * Ảnh badges được đọc từ: <project-root>/badges/*.png
 * Quy ước đặt tên file: snake_case của badge code (vd: FIRST_STEPS → first_steps.png)
 */

import 'dotenv/config';
import path from 'path';
import fs from 'fs';
import mongoose from 'mongoose';
import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const MONGODB_URI = process.env.MONGODB_URI as string;

// Thư mục chứa ảnh badges (tương đối so với repo root: foodshare/badges)
// __dirname = foodshare-backend-server/src/seeds → ../../.. = foodshare/
const BADGES_DIR = path.resolve(__dirname, '../../..', 'badges');

// =============================================
// DANH MỤC 15 HUY HIỆU
// =============================================

interface BadgeSeedData {
  code: string;
  name: string;
  description: string;
  targetRole: 'USER' | 'STORE' | 'BOTH';
  triggerEvent: string;
  pointReward: number;
  sortOrder: number;
  imageFile: string; // snake_case filename (không có .png)
}

const BADGE_CATALOG: BadgeSeedData[] = [
  // NHÓM 1 — HUY HIỆU CHUNG (BOTH)
  {
    code: 'FIRST_STEPS',
    name: 'Bước Chân Đầu Tiên',
    description: 'Hoàn thiện thông tin hồ sơ cá nhân của bạn lần đầu tiên.',
    targetRole: 'BOTH',
    triggerEvent: 'PROFILE_COMPLETED',
    pointReward: 10,
    sortOrder: 1,
    imageFile: 'first_steps',
  },
  {
    code: 'GREEN_SEEDLING',
    name: 'Mầm Xanh',
    description: 'Tích lũy đủ 50 Green Points. Hành trình xanh đang bắt đầu!',
    targetRole: 'BOTH',
    triggerEvent: 'GREENPOINTS_AWARDED',
    pointReward: 20,
    sortOrder: 2,
    imageFile: 'green_seedling',
  },
  {
    code: 'GREEN_LEAF',
    name: 'Lá Xanh',
    description: 'Tích lũy đủ 200 Green Points. Bạn đang lớn dần từng ngày!',
    targetRole: 'BOTH',
    triggerEvent: 'GREENPOINTS_AWARDED',
    pointReward: 30,
    sortOrder: 3,
    imageFile: 'green_leaf',
  },
  {
    code: 'GREEN_TREE',
    name: 'Cây Xanh',
    description: 'Tích lũy đủ 500 Green Points. Một cây xanh vững chãi vì cộng đồng!',
    targetRole: 'BOTH',
    triggerEvent: 'GREENPOINTS_AWARDED',
    pointReward: 50,
    sortOrder: 4,
    imageFile: 'green_tree',
  },
  {
    code: 'BELOVED_MEMBER',
    name: 'Thành Viên Được Yêu',
    description: 'Nhận được 5 đánh giá 5 sao từ cộng đồng FoodShare.',
    targetRole: 'BOTH',
    triggerEvent: 'REVIEW_RECEIVED',
    pointReward: 40,
    sortOrder: 5,
    imageFile: 'beloved_member',
  },
  {
    code: 'TRUSTED_PARTNER',
    name: 'Đối Tác Tin Cậy',
    description: 'Duy trì điểm đánh giá trung bình ≥ 4.8 với ít nhất 10 lượt đánh giá.',
    targetRole: 'BOTH',
    triggerEvent: 'REVIEW_RECEIVED',
    pointReward: 60,
    sortOrder: 6,
    imageFile: 'trusted_partner',
  },
  {
    code: 'EARLY_BIRD',
    name: 'Chim Sớm',
    description: 'Đăng ký và hoàn thiện hồ sơ trong vòng 90 ngày đầu ra mắt ứng dụng.',
    targetRole: 'BOTH',
    triggerEvent: 'PROFILE_COMPLETED',
    pointReward: 25,
    sortOrder: 7,
    imageFile: 'early_bird',
  },

  // NHÓM 2 — HUY HIỆU USER CÁ NHÂN
  {
    code: 'FIRST_SHARE',
    name: 'Lần Chia Sẻ Đầu Tiên',
    description: 'Tạo bài đăng chia sẻ thực phẩm miễn phí (P2P) đầu tiên của bạn.',
    targetRole: 'USER',
    triggerEvent: 'POST_CREATED',
    pointReward: 15,
    sortOrder: 8,
    imageFile: 'first_share',
  },
  {
    code: 'FIRST_RESCUE',
    name: 'Lần Giải Cứu Đầu Tiên',
    description: 'Hoàn tất giao dịch xin đồ (P2P) đầu tiên của bạn.',
    targetRole: 'USER',
    triggerEvent: 'TRANSACTION_COMPLETED',
    pointReward: 15,
    sortOrder: 9,
    imageFile: 'first_rescue',
  },
  {
    code: 'FOOD_HERO',
    name: 'Anh Hùng Thực Phẩm',
    description: 'Tạo đủ 10 bài đăng chia sẻ thực phẩm miễn phí. Cảm ơn vì sự hào phóng của bạn!',
    targetRole: 'USER',
    triggerEvent: 'POST_CREATED',
    pointReward: 50,
    sortOrder: 10,
    imageFile: 'food_hero',
  },
  {
    code: 'GENEROUS_SOUL',
    name: 'Tâm Hồn Hào Phóng',
    description: 'Là người cho trong 20 giao dịch chia sẻ P2P hoàn tất. Bạn thật tuyệt vời!',
    targetRole: 'USER',
    triggerEvent: 'TRANSACTION_COMPLETED',
    pointReward: 100,
    sortOrder: 11,
    imageFile: 'generous_soul',
  },

  // NHÓM 3 — HUY HIỆU CỬA HÀNG
  {
    code: 'STORE_PIONEER',
    name: 'Cửa Hàng Tiên Phong',
    description: 'Xác minh KYC thành công và gia nhập cộng đồng cửa hàng FoodShare.',
    targetRole: 'STORE',
    triggerEvent: 'KYC_APPROVED',
    pointReward: 20,
    sortOrder: 12,
    imageFile: 'store_pioneer',
  },
  {
    code: 'MYSTERY_MASTER',
    name: 'Bậc Thầy Mystery Bag',
    description: 'Bán được 10 mystery bag hoàn tất. Túi bí ẩn của bạn luôn được yêu thích!',
    targetRole: 'STORE',
    triggerEvent: 'TRANSACTION_COMPLETED',
    pointReward: 50,
    sortOrder: 13,
    imageFile: 'mystery_master',
  },
  {
    code: 'ECO_CHAMPION',
    name: 'Nhà Vô Địch Eco',
    description: 'Bán được 50 mystery bag hoàn tất. Bạn là chiến binh chống lãng phí thực phẩm!',
    targetRole: 'STORE',
    triggerEvent: 'TRANSACTION_COMPLETED',
    pointReward: 100,
    sortOrder: 14,
    imageFile: 'eco_champion',
  },
  {
    code: 'GIVING_STORE',
    name: 'Cửa Hàng Tốt Bụng',
    description: 'Tạo ít nhất 3 bài đăng chia sẻ miễn phí dù là cửa hàng. Cảm ơn tấm lòng của bạn!',
    targetRole: 'STORE',
    triggerEvent: 'POST_CREATED',
    pointReward: 60,
    sortOrder: 15,
    imageFile: 'giving_store',
  },
];

// =============================================
// UPLOAD HELPERS
// =============================================

async function uploadBadgeImage(filePath: string, publicId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload(
      filePath,
      {
        public_id: publicId,
        folder: 'foodshare/badges',
        resource_type: 'image',
        overwrite: true,
        transformation: [{ quality: 'auto', fetch_format: 'auto' }],
      },
      (error, result) => {
        if (error || !result) {
          reject(error || new Error('Upload thất bại'));
          return;
        }
        resolve(result.secure_url);
      }
    );
  });
}

// =============================================
// MAIN SEED FUNCTION
// =============================================

async function seedBadges() {
  console.log('🌱 [SeedBadges] Bắt đầu seed huy hiệu...\n');

  // 1. Kết nối MongoDB
  await mongoose.connect(MONGODB_URI);
  console.log('✅ Đã kết nối MongoDB\n');

  // Lazy import model (sau khi kết nối)
  const Badge = (await import('@/models/Badge')).default;

  // 2. Upload từng ảnh badge lên Cloudinary và collect URL
  console.log(`📁 Đọc ảnh badges từ: ${BADGES_DIR}\n`);

  if (!fs.existsSync(BADGES_DIR)) {
    console.error(`❌ Không tìm thấy thư mục badges tại: ${BADGES_DIR}`);
    process.exit(1);
  }

  const imageUrlMap = new Map<string, string>();

  for (const badge of BADGE_CATALOG) {
    const filePath = path.join(BADGES_DIR, `${badge.imageFile}.png`);

    if (!fs.existsSync(filePath)) {
      console.warn(`⚠️  Không tìm thấy ảnh: ${filePath} — bỏ qua upload, dùng placeholder`);
      imageUrlMap.set(badge.code, '');
      continue;
    }

    try {
      process.stdout.write(`⬆️  Upload ${badge.imageFile}.png ...`);
      const url = await uploadBadgeImage(filePath, badge.imageFile);
      imageUrlMap.set(badge.code, url);
      console.log(` ✅ ${url}`);
    } catch (err) {
      console.log(` ❌ Lỗi: ${(err as Error).message}`);
      imageUrlMap.set(badge.code, '');
    }
  }

  console.log('\n📦 Seed Badge documents vào MongoDB...\n');

  // 3. Upsert từng badge (chạy lại nhiều lần không bị duplicate)
  let created = 0;
  let updated = 0;

  for (const badge of BADGE_CATALOG) {
    const imageUrl = imageUrlMap.get(badge.code) || '';

    const result = await Badge.findOneAndUpdate(
      { code: badge.code },
      {
        $set: {
          name: badge.name,
          description: badge.description,
          targetRole: badge.targetRole,
          triggerEvent: badge.triggerEvent,
          pointReward: badge.pointReward,
          sortOrder: badge.sortOrder,
          isActive: true,
          ...(imageUrl && { imageUrl }),
        },
        $setOnInsert: {
          ...(imageUrl ? {} : { imageUrl: '' }),
        },
      },
      { upsert: true, returnDocument: 'after', runValidators: false }
    );

    if (result) {
      const wasNew = result.createdAt.getTime() === result.updatedAt.getTime();
      if (wasNew) {
        created++;
        console.log(`  ➕ Tạo mới: ${badge.code} — ${badge.name}`);
      } else {
        updated++;
        console.log(`  🔄 Cập nhật: ${badge.code} — ${badge.name}`);
      }
    }
  }

  console.log(`\n✅ Seed hoàn tất! Tạo mới: ${created} | Cập nhật: ${updated}\n`);

  // 4. Hiển thị tổng kết URL
  console.log('📋 Danh sách imageUrl đã seed:\n');
  for (const badge of BADGE_CATALOG) {
    const url = imageUrlMap.get(badge.code) || '(chưa có ảnh)';
    console.log(`  ${badge.code.padEnd(20)} → ${url}`);
  }

  await mongoose.disconnect();
  console.log('\n🔌 Đã ngắt kết nối MongoDB. Seed hoàn tất!');
}

seedBadges().catch((err) => {
  console.error('❌ Seed thất bại:', err);
  process.exit(1);
});

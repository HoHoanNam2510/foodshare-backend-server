import Category from '@/models/Category';
import logger from '@/utils/logger';

const SYSTEM_CATEGORIES = [
  {
    slug: 'vegetables',
    name: 'Rau củ quả',
    icon: 'sprout',
    color: '#2E7D32',
    applyTo: 'BOTH' as const,
    isSystem: true,
    sortOrder: 1,
  },
  {
    slug: 'starches',
    name: 'Tinh bột',
    icon: 'bread-slice',
    color: '#E65100',
    applyTo: 'BOTH' as const,
    isSystem: true,
    sortOrder: 2,
  },
  {
    slug: 'protein',
    name: 'Đạm (Thịt, Cá, Trứng)',
    icon: 'food-drumstick',
    color: '#B71C1C',
    applyTo: 'BOTH' as const,
    isSystem: true,
    sortOrder: 3,
  },
  {
    slug: 'seafood',
    name: 'Hải sản',
    icon: 'fish',
    color: '#01579B',
    applyTo: 'BOTH' as const,
    isSystem: true,
    sortOrder: 4,
  },
  {
    slug: 'dairy',
    name: 'Sữa & Chế phẩm',
    icon: 'cup',
    color: '#6A1B9A',
    applyTo: 'BOTH' as const,
    isSystem: true,
    sortOrder: 5,
  },
  {
    slug: 'bakery',
    name: 'Bánh & Đồ ngọt',
    icon: 'cake-variant',
    color: '#AD1457',
    applyTo: 'BOTH' as const,
    isSystem: true,
    sortOrder: 6,
  },
  {
    slug: 'beverages',
    name: 'Đồ uống',
    icon: 'bottle-soda',
    color: '#006064',
    applyTo: 'BOTH' as const,
    isSystem: true,
    sortOrder: 7,
  },
  {
    slug: 'dry-goods',
    name: 'Đồ khô & Gia vị',
    icon: 'package-variant',
    color: '#4E342E',
    applyTo: 'BOTH' as const,
    isSystem: true,
    sortOrder: 8,
  },
  {
    slug: 'ready-to-eat',
    name: 'Đồ ăn sẵn',
    icon: 'silverware-fork-knife',
    color: '#37474F',
    applyTo: 'BOTH' as const,
    isSystem: true,
    sortOrder: 9,
  },
];

/**
 * Seed các category hệ thống mặc định.
 * Idempotent: bỏ qua nếu đã có category isSystem = true trong DB.
 */
export async function seedCategories(): Promise<void> {
  try {
    const existingCount = await Category.countDocuments({ isSystem: true });
    if (existingCount > 0) return;

    await Category.insertMany(SYSTEM_CATEGORIES);
    logger.info(`✅ Đã seed ${SYSTEM_CATEGORIES.length} categories mặc định`);
  } catch (err) {
    logger.error('❌ Lỗi khi seed categories:', err);
  }
}

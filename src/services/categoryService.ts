import Category, { ICategory } from '@/models/Category';
import { cache } from '@/utils/cache';

// =============================================
// I. NHÓM SERVICE DÀNH CHO PUBLIC
// =============================================

export async function getActiveCategories(
  applyTo?: string
): Promise<ICategory[]> {
  const cacheKey = `categories:${applyTo ?? 'all'}`;
  const cached = cache.get<ICategory[]>(cacheKey);
  if (cached) return cached;

  const filter: Record<string, unknown> = { isActive: true };
  if (applyTo && ['P2P_FREE', 'B2C_MYSTERY_BAG'].includes(applyTo)) {
    filter.applyTo = { $in: [applyTo, 'BOTH'] };
  }

  const data = (await Category.find(filter)
    .sort({ sortOrder: 1 })
    .lean()) as ICategory[];
  cache.set(cacheKey, data);
  return data;
}

// =============================================
// II. NHÓM SERVICE DÀNH CHO ADMIN
// =============================================

/**
 * CAT_A01: Admin lấy toàn bộ danh sách category (cả inactive).
 */
export async function adminGetAllCategories(query: {
  isActive?: boolean;
  applyTo?: string;
  page?: number;
  limit?: number;
}): Promise<{
  categories: ICategory[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}> {
  const { isActive, applyTo, page = 1, limit = 20 } = query;

  const filter: Record<string, unknown> = {};
  if (typeof isActive === 'boolean') filter.isActive = isActive;
  if (applyTo) filter.applyTo = applyTo;

  const skip = (page - 1) * limit;
  const [categories, total] = await Promise.all([
    Category.find(filter).sort({ sortOrder: 1 }).skip(skip).limit(limit).lean(),
    Category.countDocuments(filter),
  ]);

  return {
    categories,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * CAT_A02: Admin tạo category mới.
 */
export async function adminCreateCategory(data: {
  slug: string;
  name: string;
  icon?: string;
  color: string;
  applyTo: 'P2P_FREE' | 'B2C_MYSTERY_BAG' | 'BOTH';
  sortOrder?: number;
}): Promise<ICategory> {
  const existing = await Category.findOne({ slug: data.slug.toLowerCase() });
  if (existing) {
    const err = new Error(`Slug "${data.slug}" đã tồn tại`);
    (err as Error & { statusCode?: number }).statusCode = 409;
    throw err;
  }

  return Category.create({ ...data, isSystem: false }) as Promise<ICategory>;
}

/**
 * CAT_A03: Admin cập nhật category.
 */
export async function adminUpdateCategory(
  categoryId: string,
  updates: Partial<{
    name: string;
    icon: string;
    color: string;
    applyTo: 'P2P_FREE' | 'B2C_MYSTERY_BAG' | 'BOTH';
    sortOrder: number;
    isActive: boolean;
  }>
): Promise<ICategory> {
  const category = await Category.findById(categoryId);
  if (!category) {
    const err = new Error('Không tìm thấy category');
    (err as Error & { statusCode?: number }).statusCode = 404;
    throw err;
  }

  Object.assign(category, updates);
  const saved = (await category.save()) as unknown as ICategory;
  cache.del([
    'categories:all',
    'categories:P2P_FREE',
    'categories:B2C_MYSTERY_BAG',
  ]);
  return saved;
}

export async function adminDeleteCategory(categoryId: string): Promise<void> {
  const category = await Category.findById(categoryId);
  if (!category) {
    const err = new Error('Không tìm thấy category');
    (err as Error & { statusCode?: number }).statusCode = 404;
    throw err;
  }

  if (category.isSystem) {
    const err = new Error('Không thể xóa category do hệ thống tạo');
    (err as Error & { statusCode?: number }).statusCode = 403;
    throw err;
  }

  category.isActive = false;
  await category.save();
  cache.del([
    'categories:all',
    'categories:P2P_FREE',
    'categories:B2C_MYSTERY_BAG',
  ]);
}

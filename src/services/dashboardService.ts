import User from '@/models/User';
import Post from '@/models/Post';
import Transaction from '@/models/Transaction';
import Report from '@/models/Report';
import mongoose from 'mongoose';

// ─── Types ───────────────────────────────────────────────────

export type TimeRange = 'day' | 'week' | 'month';

interface ChartPoint {
  name: string;
  total: number;
}

interface OverviewStats {
  users: { total: number; active: number; banned: number; pendingKyc: number };
  posts: { total: number; available: number; pendingReview: number; hidden: number };
  transactions: { total: number; pending: number; completed: number; disputed: number; totalRevenue: number };
  reports: { total: number; pending: number; resolved: number; dismissed: number };
}

interface PaginatedResult<T> {
  data: T[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

// ─── Helpers ─────────────────────────────────────────────────

function getWeekStart(d: Date): Date {
  const result = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = result.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  result.setDate(result.getDate() + diff);
  return result;
}

/**
 * Build date range and bucket config.
 * @param range  day | week | month
 * @param anchor Optional anchor date (defaults to now). For 'day' it uses that specific day,
 *               for 'week' the week containing that date, for 'month' the month of that date.
 */
function getDateRange(
  range: TimeRange,
  anchor?: Date
): {
  start: Date;
  end: Date;
  buckets: string[];
  groupFormat: Record<string, unknown>;
  labelFn: (doc: any) => string;
} {
  const ref = anchor ?? new Date();

  if (range === 'day') {
    const start = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const buckets = ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00'];
    return {
      start,
      end,
      buckets,
      groupFormat: { $multiply: [{ $floor: { $divide: [{ $hour: '$createdAt' }, 4] } }, 4] },
      labelFn: (doc: any) => `${String(doc._id).padStart(2, '0')}:00`,
    };
  }

  if (range === 'week') {
    const start = getWeekStart(ref);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    const buckets = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
    return {
      start,
      end,
      buckets,
      groupFormat: { $dayOfWeek: '$createdAt' }, // 1=Sun, 2=Mon, ...
      labelFn: (doc: any) => {
        const map: Record<number, string> = { 2: 'T2', 3: 'T3', 4: 'T4', 5: 'T5', 6: 'T6', 7: 'T7', 1: 'CN' };
        return map[doc._id] || '';
      },
    };
  }

  // month — group by week of month (1-based)
  const start = new Date(ref.getFullYear(), ref.getMonth(), 1);
  const end = new Date(ref.getFullYear(), ref.getMonth() + 1, 1);
  const daysInMonth = new Date(ref.getFullYear(), ref.getMonth() + 1, 0).getDate();
  const weekCount = Math.ceil(daysInMonth / 7);
  const buckets = Array.from({ length: weekCount }, (_, i) => `Tuần ${i + 1}`);
  return {
    start,
    end,
    buckets,
    groupFormat: { $ceil: { $divide: [{ $dayOfMonth: '$createdAt' }, 7] } },
    labelFn: (doc: any) => `Tuần ${doc._id}`,
  };
}

async function getGrowthData(model: mongoose.Model<any>, range: TimeRange, anchor?: Date): Promise<ChartPoint[]> {
  const { start, end, buckets, groupFormat, labelFn } = getDateRange(range, anchor);

  const results = await model.aggregate([
    { $match: { createdAt: { $gte: start, $lt: end } } },
    { $group: { _id: groupFormat, total: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);

  const resultMap = new Map<string, number>();
  for (const doc of results) {
    resultMap.set(labelFn(doc), doc.total);
  }

  return buckets.map((name) => ({ name, total: resultMap.get(name) || 0 }));
}

// ─── Overview Stats ──────────────────────────────────────────

export async function getOverviewStats(): Promise<OverviewStats> {
  const [userStats, postStats, txStats, reportStats] = await Promise.all([
    User.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          active: { $sum: { $cond: [{ $eq: ['$status', 'ACTIVE'] }, 1, 0] } },
          banned: { $sum: { $cond: [{ $eq: ['$status', 'BANNED'] }, 1, 0] } },
          pendingKyc: { $sum: { $cond: [{ $eq: ['$status', 'PENDING_KYC'] }, 1, 0] } },
        },
      },
    ]),
    Post.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          available: { $sum: { $cond: [{ $eq: ['$status', 'AVAILABLE'] }, 1, 0] } },
          pendingReview: { $sum: { $cond: [{ $eq: ['$status', 'PENDING_REVIEW'] }, 1, 0] } },
          hidden: { $sum: { $cond: [{ $eq: ['$status', 'HIDDEN'] }, 1, 0] } },
        },
      },
    ]),
    Transaction.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          pending: { $sum: { $cond: [{ $eq: ['$status', 'PENDING'] }, 1, 0] } },
          completed: { $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0] } },
          disputed: { $sum: { $cond: [{ $eq: ['$status', 'DISPUTED'] }, 1, 0] } },
          totalRevenue: {
            $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, { $ifNull: ['$totalAmount', 0] }, 0] },
          },
        },
      },
    ]),
    Report.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          pending: { $sum: { $cond: [{ $eq: ['$status', 'PENDING'] }, 1, 0] } },
          resolved: { $sum: { $cond: [{ $eq: ['$status', 'RESOLVED'] }, 1, 0] } },
          dismissed: { $sum: { $cond: [{ $eq: ['$status', 'DISMISSED'] }, 1, 0] } },
        },
      },
    ]),
  ]);

  const u = userStats[0] || { total: 0, active: 0, banned: 0, pendingKyc: 0 };
  const p = postStats[0] || { total: 0, available: 0, pendingReview: 0, hidden: 0 };
  const t = txStats[0] || { total: 0, pending: 0, completed: 0, disputed: 0, totalRevenue: 0 };
  const r = reportStats[0] || { total: 0, pending: 0, resolved: 0, dismissed: 0 };

  return {
    users: { total: u.total, active: u.active, banned: u.banned, pendingKyc: u.pendingKyc },
    posts: { total: p.total, available: p.available, pendingReview: p.pendingReview, hidden: p.hidden },
    transactions: { total: t.total, pending: t.pending, completed: t.completed, disputed: t.disputed, totalRevenue: t.totalRevenue },
    reports: { total: r.total, pending: r.pending, resolved: r.resolved, dismissed: r.dismissed },
  };
}

// ─── Growth Charts ───────────────────────────────────────────

export async function getGrowthChart(tab: string, range: TimeRange, anchor?: Date): Promise<ChartPoint[]> {
  const modelMap: Record<string, mongoose.Model<any>> = {
    users: User,
    posts: Post,
    transactions: Transaction,
    reports: Report,
  };

  if (tab === 'audits') {
    return getAuditGrowth(range, anchor);
  }

  const model = modelMap[tab];
  if (!model) return [];

  return getGrowthData(model, range, anchor);
}

async function getAuditGrowth(range: TimeRange, anchor?: Date): Promise<ChartPoint[]> {
  const { start, end, buckets, groupFormat, labelFn } = getDateRange(range, anchor);

  const models = [User, Post, Transaction, Report];
  const allResults: Map<string, number> = new Map();

  const aggregations = models.map((model) =>
    model.aggregate([
      { $match: { updatedAt: { $gte: start, $lt: end } } },
      {
        $group: {
          _id: { $let: { vars: { dt: '$updatedAt' }, in: groupFormat } },
          total: { $sum: 1 },
        },
      },
    ])
  );

  const results = await Promise.all(aggregations);
  for (const modelResults of results) {
    for (const doc of modelResults) {
      const label = labelFn(doc);
      allResults.set(label, (allResults.get(label) || 0) + doc.total);
    }
  }

  return buckets.map((name) => ({ name, total: allResults.get(name) || 0 }));
}

// ─── Data Tables ─────────────────────────────────────────────

const DEFAULT_LIMIT = 10;

export type SortOrder = 'asc' | 'desc';

export async function getRecentUsers(page: number, limit: number = DEFAULT_LIMIT, sortOrder: SortOrder = 'desc'): Promise<PaginatedResult<any>> {
  const skip = (page - 1) * limit;
  const sort = sortOrder === 'asc' ? 1 : -1;
  const [data, total] = await Promise.all([
    User.find()
      .select('fullName email role status kycStatus createdAt')
      .sort({ createdAt: sort })
      .skip(skip)
      .limit(limit)
      .lean(),
    User.countDocuments(),
  ]);

  return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

export async function getRecentPosts(page: number, limit: number = DEFAULT_LIMIT, sortOrder: SortOrder = 'desc'): Promise<PaginatedResult<any>> {
  const skip = (page - 1) * limit;
  const sort = sortOrder === 'asc' ? 1 : -1;
  const [data, total] = await Promise.all([
    Post.find()
      .select('title type status remainingQuantity totalQuantity price createdAt')
      .populate('ownerId', 'fullName')
      .sort({ createdAt: sort })
      .skip(skip)
      .limit(limit)
      .lean(),
    Post.countDocuments(),
  ]);

  return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

export async function getRecentTransactions(page: number, limit: number = DEFAULT_LIMIT, sortOrder: SortOrder = 'desc'): Promise<PaginatedResult<any>> {
  const skip = (page - 1) * limit;
  const sort = sortOrder === 'asc' ? 1 : -1;
  const [data, total] = await Promise.all([
    Transaction.find()
      .select('type status paymentMethod totalAmount quantity createdAt')
      .populate('requesterId', 'fullName')
      .populate('ownerId', 'fullName')
      .populate('postId', 'title')
      .sort({ createdAt: sort })
      .skip(skip)
      .limit(limit)
      .lean(),
    Transaction.countDocuments(),
  ]);

  return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

export async function getRecentReports(page: number, limit: number = DEFAULT_LIMIT, sortOrder: SortOrder = 'desc'): Promise<PaginatedResult<any>> {
  const skip = (page - 1) * limit;
  const sort = sortOrder === 'asc' ? 1 : -1;
  const [data, total] = await Promise.all([
    Report.find()
      .select('targetType reason status actionTaken createdAt')
      .populate('reporterId', 'fullName')
      .sort({ createdAt: sort })
      .skip(skip)
      .limit(limit)
      .lean(),
    Report.countDocuments(),
  ]);

  return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

export async function getAuditLogs(page: number, limit: number = DEFAULT_LIMIT, sortOrder: SortOrder = 'desc'): Promise<PaginatedResult<any>> {
  const skip = (page - 1) * limit;
  const sort = sortOrder === 'asc' ? 1 : -1;

  const [users, posts, transactions, reports] = await Promise.all([
    User.find()
      .select('fullName email updatedAt')
      .sort({ updatedAt: sort })
      .limit(limit * 2)
      .lean()
      .then((docs) => docs.map((d) => ({ ...d, _type: 'USER' as const }))),
    Post.find()
      .select('title status updatedAt')
      .sort({ updatedAt: sort })
      .limit(limit * 2)
      .lean()
      .then((docs) => docs.map((d) => ({ ...d, _type: 'POST' as const }))),
    Transaction.find()
      .select('type status totalAmount updatedAt')
      .sort({ updatedAt: sort })
      .limit(limit * 2)
      .lean()
      .then((docs) => docs.map((d) => ({ ...d, _type: 'TRANSACTION' as const }))),
    Report.find()
      .select('targetType status actionTaken updatedAt')
      .sort({ updatedAt: sort })
      .limit(limit * 2)
      .lean()
      .then((docs) => docs.map((d) => ({ ...d, _type: 'REPORT' as const }))),
  ]);

  const all = [...users, ...posts, ...transactions, ...reports].sort((a, b) => {
    const diff = new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    return sortOrder === 'asc' ? -diff : diff;
  });

  const total = all.length;
  const data = all.slice(skip, skip + limit);

  return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

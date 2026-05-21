import mongoose, { PipelineStage } from 'mongoose';
import Transaction from '@/models/Transaction';
import PointLog from '@/models/PointLog';
import { StatisticsQuery } from '@/validations/statisticsValidation';

// ─── Response Types ────────────────────────────────────────────
export interface TimeseriesPoint {
  name: string;
  given: number;
  received: number;
  revenue: number;
}

export interface Summary {
  totalGiven: number;
  totalReceived: number;
  totalRevenue: number;
  txCount: number;
}

export interface TopItem {
  postId: string;
  title: string;
  type: 'P2P_FREE' | 'B2C_MYSTERY_BAG';
  count: number;
}

export interface TopCounterpart {
  userId: string;
  fullName: string;
  avatar?: string;
  count: number;
}

export interface StatisticsResult {
  timeseries: TimeseriesPoint[];
  summary: Summary;
  topItems: TopItem[];
  topCounterparts: TopCounterpart[];
  totalGreenPointsEarned: number;
  compare?: {
    previousTimeseries: TimeseriesPoint[];
    givenPct: number | null;
    receivedPct: number | null;
    revenuePct: number | null;
    pointsPct: number | null;
  };
}

// ─── Helpers ───────────────────────────────────────────────────
function getDateRangeFromQuery(
  range: StatisticsQuery['range'],
  from?: string,
  to?: string
): { start: Date; end: Date } {
  const now = new Date();
  switch (range) {
    case '7d': {
      const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return { start, end: now };
    }
    case '30d': {
      const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return { start, end: now };
    }
    case '12m': {
      const start = new Date(
        now.getFullYear() - 1,
        now.getMonth(),
        now.getDate()
      );
      return { start, end: now };
    }
    case 'custom': {
      if (!from || !to)
        throw new Error('from and to required for custom range');
      const start = new Date(from);
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }
  }
}

function getBucketConfig(
  range: StatisticsQuery['range'],
  from?: string,
  to?: string
): { format: string; timezone: string } {
  if (range === 'custom' && from && to) {
    const start = new Date(from);
    const end = new Date(to);
    const diffInDays =
      (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000);
    return diffInDays <= 31
      ? { format: '%Y-%m-%d', timezone: 'Asia/Ho_Chi_Minh' }
      : { format: '%Y-%m', timezone: 'Asia/Ho_Chi_Minh' };
  }
  return range === '12m'
    ? { format: '%Y-%m', timezone: 'Asia/Ho_Chi_Minh' }
    : { format: '%Y-%m-%d', timezone: 'Asia/Ho_Chi_Minh' };
}

// ─── Pipeline Builder ──────────────────────────────────────────
function buildTransactionPipeline(
  userId: mongoose.Types.ObjectId,
  start: Date,
  end: Date,
  bucketConfig: { format: string; timezone: string },
  postType?: StatisticsQuery['postType']
): PipelineStage[] {
  const pipeline: PipelineStage[] = [];

  // Match transactions involving user in date range
  pipeline.push({
    $match: {
      $or: [{ ownerId: userId }, { requesterId: userId }],
      createdAt: { $gte: start, $lte: end },
    },
  });

  // Lookup post to filter by type
  pipeline.push(
    {
      $lookup: {
        from: 'posts',
        localField: 'postId',
        foreignField: '_id',
        as: 'post',
      },
    },
    { $unwind: { path: '$post', preserveNullAndEmptyArrays: false } }
  );

  // Filter by post type if specified
  if (postType && postType !== 'ALL') {
    pipeline.push({ $match: { 'post.type': postType } });
  }

  // Add time bucket for grouping
  pipeline.push({
    $addFields: {
      bucket: {
        $dateToString: {
          format: bucketConfig.format,
          date: '$createdAt',
          timezone: bucketConfig.timezone,
        },
      },
    },
  });

  // Faceted aggregation
  pipeline.push({
    $facet: {
      timeseries: [
        {
          $group: {
            _id: '$bucket',
            given: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ['$ownerId', userId] },
                      { $eq: ['$status', 'COMPLETED'] },
                    ],
                  },
                  '$quantity',
                  0,
                ],
              },
            },
            received: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ['$requesterId', userId] },
                      { $eq: ['$status', 'COMPLETED'] },
                    ],
                  },
                  '$quantity',
                  0,
                ],
              },
            },
            revenue: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ['$ownerId', userId] },
                      { $eq: ['$status', 'COMPLETED'] },
                    ],
                  },
                  { $ifNull: ['$totalAmount', 0] },
                  0,
                ],
              },
            },
          },
        },
        { $sort: { _id: 1 } },
      ],
      summary: [
        {
          $group: {
            _id: null,
            totalGiven: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ['$ownerId', userId] },
                      { $eq: ['$status', 'COMPLETED'] },
                    ],
                  },
                  '$quantity',
                  0,
                ],
              },
            },
            totalReceived: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ['$requesterId', userId] },
                      { $eq: ['$status', 'COMPLETED'] },
                    ],
                  },
                  '$quantity',
                  0,
                ],
              },
            },
            totalRevenue: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ['$ownerId', userId] },
                      { $eq: ['$status', 'COMPLETED'] },
                    ],
                  },
                  { $ifNull: ['$totalAmount', 0] },
                  0,
                ],
              },
            },
            txCount: {
              $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0] },
            },
          },
        },
      ],
      topItems: [
        { $match: { status: 'COMPLETED' } },
        {
          $group: {
            _id: '$postId',
            count: { $sum: '$quantity' },
            title: { $first: '$post.title' },
            type: { $first: '$post.type' },
          },
        },
        { $sort: { count: -1 } },
        { $limit: 5 },
        {
          $project: { postId: '$_id', title: 1, type: 1, count: 1, _id: 0 },
        },
      ],
      topCounterparts: [
        { $match: { status: 'COMPLETED' } },
        {
          $addFields: {
            counterpartId: {
              $cond: [
                { $eq: ['$ownerId', userId] },
                '$requesterId',
                '$ownerId',
              ],
            },
          },
        },
        {
          $group: {
            _id: '$counterpartId',
            count: { $sum: '$quantity' },
          },
        },
        { $sort: { count: -1 } },
        { $limit: 5 },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'counterpart',
          },
        },
        { $unwind: '$counterpart' },
        {
          $project: {
            userId: '$_id',
            fullName: '$counterpart.fullName',
            avatar: '$counterpart.avatar',
            count: 1,
            _id: 0,
          },
        },
      ],
    },
  });

  return pipeline;
}

// ─── Main Service Function ─────────────────────────────────────
export async function getMyStatistics(
  userId: string,
  _role: string,
  query: StatisticsQuery
): Promise<StatisticsResult> {
  const userObjectId = new mongoose.Types.ObjectId(userId);
  const { range, from, to, compareFrom, compareTo, postType } = query;

  // Main period data
  const { start: mainStart, end: mainEnd } = getDateRangeFromQuery(
    range,
    from,
    to
  );
  const bucketConfig = getBucketConfig(range, from, to);
  const mainPipeline = buildTransactionPipeline(
    userObjectId,
    mainStart,
    mainEnd,
    bucketConfig,
    postType
  );

  const [mainResult, pointLogResult] = await Promise.all([
    Transaction.aggregate(mainPipeline),
    PointLog.aggregate([
      {
        $match: {
          userId: userObjectId,
          amount: { $gt: 0 },
          createdAt: { $gte: mainStart, $lte: mainEnd },
        },
      },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
  ]);

  // Process main results
  const mainRaw = mainResult[0] || {};
  const timeseries: TimeseriesPoint[] = (
    mainRaw.timeseries as Array<{
      _id: string;
      given: number;
      received: number;
      revenue: number;
    }>
  ).map((p) => ({
    name: p._id,
    given: p.given,
    received: p.received,
    revenue: p.revenue,
  }));
  const summaryRaw = mainRaw.summary?.[0] || {
    totalGiven: 0,
    totalReceived: 0,
    totalRevenue: 0,
    txCount: 0,
  };
  const summary: Summary = {
    totalGiven: summaryRaw.totalGiven,
    totalReceived: summaryRaw.totalReceived,
    totalRevenue: summaryRaw.totalRevenue,
    txCount: summaryRaw.txCount,
  };
  const topItems: TopItem[] = mainRaw.topItems || [];
  const topCounterparts: TopCounterpart[] = mainRaw.topCounterparts || [];
  const totalGreenPointsEarned = pointLogResult[0]?.total || 0;

  // Compare period data
  let compare: StatisticsResult['compare'] = undefined;
  if (compareFrom && compareTo) {
    const compareStart = new Date(compareFrom);
    const compareEnd = new Date(compareTo);
    compareEnd.setHours(23, 59, 59, 999);
    const compareDiffInDays =
      (compareEnd.getTime() - compareStart.getTime()) / (24 * 60 * 60 * 1000);
    const compareBucketConfig =
      compareDiffInDays <= 31
        ? { format: '%Y-%m-%d', timezone: 'Asia/Ho_Chi_Minh' }
        : { format: '%Y-%m', timezone: 'Asia/Ho_Chi_Minh' };
    const comparePipeline = buildTransactionPipeline(
      userObjectId,
      compareStart,
      compareEnd,
      compareBucketConfig,
      postType
    );
    const [compareResult, comparePointLogResult] = await Promise.all([
      Transaction.aggregate(comparePipeline),
      PointLog.aggregate([
        {
          $match: {
            userId: userObjectId,
            amount: { $gt: 0 },
            createdAt: { $gte: compareStart, $lte: compareEnd },
          },
        },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
    ]);

    const compareRaw = compareResult[0] || {};
    const compareSummaryRaw = compareRaw.summary?.[0] || {
      totalGiven: 0,
      totalReceived: 0,
      totalRevenue: 0,
      txCount: 0,
    };
    const previousTimeseries: TimeseriesPoint[] = (
      (compareRaw.timeseries as Array<{
        _id: string;
        given: number;
        received: number;
        revenue: number;
      }>) || []
    ).map((p) => ({
      name: p._id,
      given: p.given,
      received: p.received,
      revenue: p.revenue,
    }));
    const comparePoints = comparePointLogResult[0]?.total || 0;

    compare = {
      previousTimeseries,
      givenPct: compareSummaryRaw.totalGiven
        ? ((summary.totalGiven - compareSummaryRaw.totalGiven) /
            compareSummaryRaw.totalGiven) *
          100
        : null,
      receivedPct: compareSummaryRaw.totalReceived
        ? ((summary.totalReceived - compareSummaryRaw.totalReceived) /
            compareSummaryRaw.totalReceived) *
          100
        : null,
      revenuePct: compareSummaryRaw.totalRevenue
        ? ((summary.totalRevenue - compareSummaryRaw.totalRevenue) /
            compareSummaryRaw.totalRevenue) *
          100
        : null,
      pointsPct: comparePoints
        ? ((totalGreenPointsEarned - comparePoints) / comparePoints) * 100
        : null,
    };
  }

  return {
    timeseries,
    summary,
    topItems,
    topCounterparts,
    totalGreenPointsEarned,
    compare,
  };
}

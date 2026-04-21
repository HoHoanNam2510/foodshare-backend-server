import mongoose from 'mongoose';
import Report, {
  IReport,
  ReportTargetType,
  ReportReason,
  ReportStatus,
  ReportAction,
} from '@/models/Report';
import Post from '@/models/Post';
import User from '@/models/User';
import Transaction from '@/models/Transaction';
import Review from '@/models/Review';
import { createNotification } from '@/services/notificationService';
import { applyPenaltyPoints } from '@/services/greenPointService';
import { recalculateAverageRating } from '@/services/reviewService';

// Hằng số cho logic phạt
const REPUTATION_PENALTY = 10;
const BAN_THRESHOLD = 0;

export class ReportServiceError extends Error {
  public statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
  }
}

// =============================================
// I. NHÓM SERVICE DÀNH CHO USER / STORE
// =============================================

interface CreateReportInput {
  targetType: ReportTargetType;
  targetId: string;
  reason: ReportReason;
  description: string;
  images: string[];
}

/**
 * Tạo báo cáo vi phạm mới.
 * Kiểm tra target tồn tại, và nếu target là TRANSACTION thì reporter phải là thành viên.
 */
export async function createReport(
  reporterId: string,
  data: CreateReportInput
): Promise<IReport> {
  const { targetType, targetId, reason, description, images } = data;

  // Validate targetId là ObjectId hợp lệ
  if (!mongoose.Types.ObjectId.isValid(targetId)) {
    throw new ReportServiceError('targetId không hợp lệ', 400);
  }

  // Kiểm tra target tồn tại
  const targetExists = await verifyTargetExists(targetType, targetId);
  if (!targetExists) {
    throw new ReportServiceError(
      `Không tìm thấy ${targetType} với ID: ${targetId}`,
      404
    );
  }

  // Nếu target là TRANSACTION → reporter phải là thành viên giao dịch
  if (targetType === 'TRANSACTION') {
    const transaction = await Transaction.findById(targetId);
    if (transaction) {
      const isParticipant =
        transaction.ownerId.toString() === reporterId ||
        transaction.requesterId.toString() === reporterId;
      if (!isParticipant) {
        throw new ReportServiceError(
          'Bạn không có quyền report giao dịch mà mình không tham gia',
          403
        );
      }
    }
  }

  // Chống spam: mỗi user chỉ được gửi 1 báo cáo cho mỗi thực thể.
  // Nếu báo cáo trước đó bị DISMISSED, cho phép gửi lại.
  const existingReport = await Report.findOne({
    reporterId,
    targetType,
    targetId,
    status: { $in: ['PENDING', 'RESOLVED'] },
  });
  if (existingReport) {
    const statusLabel =
      existingReport.status === 'PENDING'
        ? 'đang chờ xử lý'
        : 'đã được giải quyết';
    throw new ReportServiceError(
      `Bạn đã gửi báo cáo cho thực thể này và báo cáo ${statusLabel}. Không thể gửi thêm.`,
      409
    );
  }

  const report = await Report.create({
    reporterId,
    targetType,
    targetId,
    reason,
    description,
    images,
    status: 'PENDING',
    actionTaken: 'NONE',
  });

  return report;
}

interface UpdateReportInput {
  reason?: ReportReason;
  description?: string;
  images?: string[];
}

/**
 * Chỉnh sửa báo cáo — chỉ cho phép khi status là PENDING và người gọi là reporter.
 */
export async function updateReport(
  reportId: string,
  reporterId: string,
  data: UpdateReportInput
): Promise<IReport> {
  if (!mongoose.Types.ObjectId.isValid(reportId)) {
    throw new ReportServiceError('Report ID không hợp lệ', 400);
  }

  const report = await Report.findById(reportId);
  if (!report) {
    throw new ReportServiceError('Không tìm thấy báo cáo', 404);
  }
  if (report.reporterId.toString() !== reporterId) {
    throw new ReportServiceError('Bạn không có quyền chỉnh sửa báo cáo này', 403);
  }
  if (report.status !== 'PENDING') {
    throw new ReportServiceError(
      'Chỉ có thể chỉnh sửa báo cáo đang ở trạng thái PENDING',
      400
    );
  }

  if (data.reason !== undefined) report.reason = data.reason;
  if (data.description !== undefined) report.description = data.description;
  if (data.images !== undefined) report.images = data.images;

  await report.save();
  return report;
}

/**
 * Rút lại (soft-delete) báo cáo — chỉ cho phép khi status là PENDING và người gọi là reporter.
 * Dùng trạng thái WITHDRAWN thay vì xóa cứng để Admin vẫn có thể tra cứu lịch sử.
 */
export async function withdrawReport(
  reportId: string,
  reporterId: string
): Promise<IReport> {
  if (!mongoose.Types.ObjectId.isValid(reportId)) {
    throw new ReportServiceError('Report ID không hợp lệ', 400);
  }

  const report = await Report.findById(reportId);
  if (!report) {
    throw new ReportServiceError('Không tìm thấy báo cáo', 404);
  }
  if (report.reporterId.toString() !== reporterId) {
    throw new ReportServiceError('Bạn không có quyền rút lại báo cáo này', 403);
  }
  if (report.status !== 'PENDING') {
    throw new ReportServiceError(
      'Chỉ có thể rút lại báo cáo đang ở trạng thái PENDING',
      400
    );
  }

  report.status = 'WITHDRAWN';
  await report.save();
  return report;
}

/**
 * Lấy danh sách báo cáo của user (đã gửi).
 */
export async function getMyReports(
  reporterId: string,
  statusFilter?: ReportStatus
): Promise<IReport[]> {
  const filter: Record<string, unknown> = { reporterId };
  if (statusFilter) {
    filter.status = statusFilter;
  }

  const reports = await Report.find(filter).sort({ createdAt: -1 }).lean();

  return reports as IReport[];
}

// =============================================
// II. NHÓM SERVICE DÀNH CHO ADMIN
// =============================================

interface AdminGetReportsQuery {
  status?: ReportStatus;
  targetType?: ReportTargetType;
  reason?: ReportReason;
  page?: number;
  limit?: number;
}

interface PaginatedResult {
  data: IReport[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Admin lấy danh sách toàn bộ report, hỗ trợ lọc & phân trang.
 */
export async function adminGetReports(
  query: AdminGetReportsQuery
): Promise<PaginatedResult> {
  const { status, targetType, reason, page = 1, limit = 20 } = query;

  const filter: Record<string, unknown> = {};
  if (status) filter.status = status;
  if (targetType) filter.targetType = targetType;
  if (reason) filter.reason = reason;

  const skip = (page - 1) * limit;

  const [reports, total] = await Promise.all([
    Report.find(filter)
      .populate('reporterId', 'fullName email avatar')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Report.countDocuments(filter),
  ]);

  return {
    data: reports as IReport[],
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Admin xem chi tiết 1 report cụ thể kèm populate target & reporter.
 */
export async function adminGetReportDetail(
  reportId: string
): Promise<IReport & { target?: unknown }> {
  if (!mongoose.Types.ObjectId.isValid(reportId)) {
    throw new ReportServiceError('Report ID không hợp lệ', 400);
  }

  const report = await Report.findById(reportId)
    .populate('reporterId', 'fullName email avatar')
    .populate('resolvedBy', 'fullName email')
    .lean();

  if (!report) {
    throw new ReportServiceError('Không tìm thấy báo cáo', 404);
  }

  // Populate targetId tùy theo targetType
  const populatedReport = await populateTarget(report as IReport);

  return populatedReport;
}

interface ProcessReportInput {
  status: 'RESOLVED' | 'DISMISSED';
  actionTaken: ReportAction;
  resolutionNote: string;
}

/**
 * Admin phán xử & thực thi hình phạt.
 * Chạy logic cross-update sang Post / User / Transaction tùy theo actionTaken.
 */
export async function adminProcessReport(
  reportId: string,
  adminId: string,
  data: ProcessReportInput
): Promise<IReport> {
  if (!mongoose.Types.ObjectId.isValid(reportId)) {
    throw new ReportServiceError('Report ID không hợp lệ', 400);
  }

  const report = await Report.findById(reportId);
  if (!report) {
    throw new ReportServiceError('Không tìm thấy báo cáo', 404);
  }

  if (report.status !== 'PENDING') {
    throw new ReportServiceError(
      'Báo cáo này đã được xử lý trước đó, không thể xử lý lại',
      400
    );
  }

  const { status, actionTaken, resolutionNote } = data;

  // Nếu RESOLVED → thực thi hình phạt dựa trên actionTaken
  if (status === 'RESOLVED') {
    await executePenalty(report, actionTaken);
  }

  // Cập nhật bản ghi Report
  report.status = status;
  report.actionTaken = status === 'DISMISSED' ? 'NONE' : actionTaken;
  report.resolutionNote = resolutionNote;
  report.resolvedBy = new mongoose.Types.ObjectId(adminId);
  report.resolvedAt = new Date();

  await report.save();

  if (status === 'DISMISSED') {
    await createNotification(
      report.reporterId.toString(),
      'SYSTEM',
      'Báo cáo bị bác bỏ',
      resolutionNote
        ? `Báo cáo của bạn đã bị bác bỏ. Lý do: ${resolutionNote}. Nếu có thêm bằng chứng, hãy gửi báo cáo mới.`
        : 'Báo cáo của bạn đã bị bác bỏ. Nếu có thêm bằng chứng, hãy gửi báo cáo mới.',
      (report._id as mongoose.Types.ObjectId).toString()
    );
  } else if (status === 'RESOLVED') {
    await createNotification(
      report.reporterId.toString(),
      'SYSTEM',
      'Báo cáo đã được xử lý',
      'Báo cáo của bạn đã được xem xét và xử lý.',
      (report._id as mongoose.Types.ObjectId).toString()
    );
  }

  return report;
}

// =============================================
// HELPER FUNCTIONS
// =============================================

/**
 * Kiểm tra target (Post / User / Transaction) có tồn tại không.
 */
async function verifyTargetExists(
  targetType: ReportTargetType,
  targetId: string
): Promise<boolean> {
  switch (targetType) {
    case 'POST':
      return !!(await Post.exists({ _id: targetId }));
    case 'USER':
      return !!(await User.exists({ _id: targetId }));
    case 'TRANSACTION':
      return !!(await Transaction.exists({ _id: targetId }));
    case 'REVIEW':
      return !!(await Review.exists({ _id: targetId }));
    default:
      return false;
  }
}

/**
 * Thực thi hình phạt cross-update dựa trên actionTaken.
 */
async function executePenalty(
  report: IReport,
  actionTaken: ReportAction
): Promise<void> {
  const { targetType, targetId } = report;

  switch (actionTaken) {
    case 'POST_HIDDEN': {
      // Ẩn bài đăng vi phạm
      const post = await Post.findById(targetId);
      if (!post) {
        throw new ReportServiceError(
          'Bài đăng mục tiêu không tồn tại, không thể ẩn',
          404
        );
      }
      post.status = 'HIDDEN';
      await post.save();
      break;
    }

    case 'USER_WARNED': {
      // Cảnh cáo + trừ điểm user + ghi PointLog
      const user = await findTargetUser(targetType, targetId.toString());
      if (!user) {
        throw new ReportServiceError(
          'Không tìm thấy user mục tiêu để cảnh cáo',
          404
        );
      }
      // Trừ điểm và ghi PointLog qua greenPointService
      await applyPenaltyPoints(
        (user._id as mongoose.Types.ObjectId).toString(),
        REPUTATION_PENALTY,
        (report._id as mongoose.Types.ObjectId).toString(),
        'Bị cảnh cáo do vi phạm chính sách cộng đồng'
      );
      // Reload user để kiểm tra ngưỡng ban
      const warnedUser = await User.findById(user._id);
      if (warnedUser && warnedUser.greenPoints <= BAN_THRESHOLD) {
        warnedUser.status = 'BANNED';
        await warnedUser.save();
      }
      break;
    }

    case 'USER_BANNED': {
      // Khóa tài khoản + trừ điểm + ghi PointLog
      const user = await findTargetUser(targetType, targetId.toString());
      if (!user) {
        throw new ReportServiceError(
          'Không tìm thấy user mục tiêu để khóa',
          404
        );
      }
      // Trừ điểm và ghi PointLog qua greenPointService
      await applyPenaltyPoints(
        (user._id as mongoose.Types.ObjectId).toString(),
        REPUTATION_PENALTY,
        (report._id as mongoose.Types.ObjectId).toString(),
        'Bị khóa tài khoản do vi phạm nghiêm trọng'
      );
      // Khóa tài khoản
      const bannedUser = await User.findById(user._id);
      if (bannedUser) {
        bannedUser.status = 'BANNED';
        await bannedUser.save();
      }
      break;
    }

    case 'REFUNDED': {
      // Hoàn tiền — chỉ áp dụng cho target là TRANSACTION
      if (targetType !== 'TRANSACTION') {
        throw new ReportServiceError(
          'Hoàn tiền chỉ áp dụng cho báo cáo loại TRANSACTION',
          400
        );
      }
      const transaction = await Transaction.findById(targetId);
      if (!transaction) {
        throw new ReportServiceError('Giao dịch mục tiêu không tồn tại', 404);
      }
      if (transaction.status !== 'ESCROWED') {
        throw new ReportServiceError(
          'Chỉ có thể hoàn tiền cho giao dịch đang ở trạng thái ESCROWED',
          400
        );
      }
      transaction.status = 'CANCELLED';
      await transaction.save();
      // TODO: Kích hoạt event hoàn tiền thực tế cho người mua (payment gateway)
      break;
    }

    case 'REVIEW_DELETED': {
      // Xóa cứng bài Review ác ý + phục hồi averageRating cho người bị đánh giá
      if (targetType !== 'REVIEW') {
        throw new ReportServiceError(
          'Hành động REVIEW_DELETED chỉ áp dụng cho báo cáo loại REVIEW',
          400
        );
      }
      const reviewToDelete = await Review.findById(targetId);
      if (!reviewToDelete) {
        throw new ReportServiceError(
          'Bài đánh giá mục tiêu không tồn tại',
          404
        );
      }
      const revieweeId = reviewToDelete.revieweeId.toString();
      await reviewToDelete.deleteOne();
      // Phục hồi averageRating cho người bị đánh giá
      await recalculateAverageRating(revieweeId);
      break;
    }

    case 'NONE':
      // Không thực thi hình phạt
      break;

    default:
      break;
  }
}

/**
 * Tìm user mục tiêu từ targetType & targetId.
 * Nếu target là POST → lấy ownerId.
 * Nếu target là USER → trả về trực tiếp.
 * Nếu target là TRANSACTION → lấy user bị report (logic tùy case).
 */
async function findTargetUser(
  targetType: ReportTargetType,
  targetId: string
): Promise<
  | (mongoose.Document & {
      greenPoints: number;
      status: string;
      save: () => Promise<unknown>;
    })
  | null
> {
  switch (targetType) {
    case 'USER':
      return User.findById(targetId);
    case 'POST': {
      const post = await Post.findById(targetId);
      if (!post) return null;
      return User.findById(post.ownerId);
    }
    case 'TRANSACTION': {
      const txn = await Transaction.findById(targetId);
      if (!txn) return null;
      // Phạt owner của giao dịch (người bán/chia sẻ)
      return User.findById(txn.ownerId);
    }
    default:
      return null;
  }
}

/**
 * Populate thông tin chi tiết của targetId dựa trên targetType.
 */
async function populateTarget(
  report: IReport
): Promise<IReport & { target?: unknown }> {
  const result = JSON.parse(JSON.stringify(report)) as IReport & {
    target?: unknown;
  };

  switch (report.targetType) {
    case 'POST':
      result.target = await Post.findById(report.targetId)
        .select('title images status ownerId type')
        .lean();
      break;
    case 'USER':
      result.target = await User.findById(report.targetId)
        .select('fullName email avatar status greenPoints')
        .lean();
      break;
    case 'TRANSACTION':
      result.target = await Transaction.findById(report.targetId)
        .select('postId requesterId ownerId status type quantity')
        .lean();
      break;
    case 'REVIEW':
      result.target = await Review.findById(report.targetId)
        .populate('reviewerId', 'fullName avatar')
        .populate('revieweeId', 'fullName avatar')
        .lean();
      break;
  }

  return result;
}

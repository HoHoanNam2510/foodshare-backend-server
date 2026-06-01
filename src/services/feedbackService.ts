import mongoose from 'mongoose';
import Feedback, {
  IFeedback,
  FeedbackType,
  FeedbackStatus,
  FeedbackPriority,
} from '@/models/Feedback';
import { createNotification } from '@/services/notificationService';

const RATE_LIMIT_COUNT = 3;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 phút

export class FeedbackServiceError extends Error {
  public statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
  }
}

// =============================================
// HELPER PRIVATE
// =============================================

function autoPriority(type: FeedbackType): FeedbackPriority {
  return type === 'BUG_REPORT' ? 'HIGH' : 'LOW';
}

async function checkRateLimit(userId: string): Promise<void> {
  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
  const count = await Feedback.countDocuments({
    userId: new mongoose.Types.ObjectId(userId),
    createdAt: { $gte: since },
  });
  if (count >= RATE_LIMIT_COUNT) {
    throw new FeedbackServiceError(
      'Bạn đã gửi quá nhiều phản hồi trong thời gian ngắn. Vui lòng thử lại sau 10 phút.',
      429
    );
  }
}

// =============================================
// I. NHÓM SERVICE DÀNH CHO USER / STORE
// =============================================

interface CreateFeedbackInput {
  type: FeedbackType;
  title: string;
  content: string;
  attachments: string[];
  contextMetadata: {
    appVersion?: string;
    os?: 'ios' | 'android' | 'web';
    relatedEntityId?: string;
  };
}

export async function createFeedback(
  userId: string,
  userRole: string,
  data: CreateFeedbackInput
): Promise<IFeedback> {
  await checkRateLimit(userId);

  const userType = userRole === 'STORE' ? 'STORE' : 'INDIVIDUAL';
  const priority = autoPriority(data.type);

  const feedback = await Feedback.create({
    userId: new mongoose.Types.ObjectId(userId),
    userType,
    type: data.type,
    priority,
    status: 'PENDING',
    title: data.title,
    content: data.content,
    attachments: data.attachments ?? [],
    contextMetadata: data.contextMetadata ?? {},
  });

  return feedback;
}

export async function getMyFeedbacks(userId: string): Promise<IFeedback[]> {
  const feedbacks = await Feedback.find({
    userId: new mongoose.Types.ObjectId(userId),
  })
    .sort({ createdAt: -1 })
    .lean();
  return feedbacks as IFeedback[];
}

// =============================================
// II. NHÓM SERVICE DÀNH CHO ADMIN
// =============================================

interface AdminGetFeedbacksQuery {
  status?: FeedbackStatus;
  type?: FeedbackType;
  priority?: FeedbackPriority;
  page?: number;
  limit?: number;
  search?: string;
}

interface PaginatedResult {
  data: IFeedback[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export async function adminGetFeedbacks(
  query: AdminGetFeedbacksQuery
): Promise<PaginatedResult> {
  const { status, type, priority, page = 1, limit = 20, search } = query;

  const filter: Record<string, unknown> = {};
  if (status) filter.status = status;
  if (type) filter.type = type;
  if (priority) filter.priority = priority;
  if (search) {
    filter.title = { $regex: search, $options: 'i' };
  }

  const skip = (page - 1) * limit;

  const [data, total] = await Promise.all([
    Feedback.find(filter)
      .populate('userId', 'fullName email phoneNumber avatar role')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Feedback.countDocuments(filter),
  ]);

  return {
    data: data as IFeedback[],
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function adminGetFeedbackDetail(
  feedbackId: string
): Promise<IFeedback> {
  if (!mongoose.Types.ObjectId.isValid(feedbackId)) {
    throw new FeedbackServiceError('Feedback ID không hợp lệ', 400);
  }

  const feedback = await Feedback.findById(feedbackId)
    .populate('userId', 'fullName email phoneNumber avatar role')
    .populate('adminId', 'fullName email')
    .lean();

  if (!feedback) {
    throw new FeedbackServiceError('Không tìm thấy phản hồi', 404);
  }

  return feedback as IFeedback;
}

export async function adminAssignFeedback(
  feedbackId: string,
  adminId: string
): Promise<IFeedback> {
  if (!mongoose.Types.ObjectId.isValid(feedbackId)) {
    throw new FeedbackServiceError('Feedback ID không hợp lệ', 400);
  }

  const feedback = await Feedback.findById(feedbackId);
  if (!feedback) {
    throw new FeedbackServiceError('Không tìm thấy phản hồi', 404);
  }
  if (feedback.status !== 'PENDING') {
    throw new FeedbackServiceError(
      'Chỉ có thể tiếp nhận phản hồi đang ở trạng thái PENDING',
      400
    );
  }

  feedback.adminId = new mongoose.Types.ObjectId(adminId);
  feedback.status = 'PROCESSING';
  await feedback.save();

  const populated = await feedback.populate([
    { path: 'userId', select: 'fullName email phoneNumber avatar role' },
    { path: 'adminId', select: 'fullName email' },
  ]);
  return populated as IFeedback;
}

export async function adminResolveFeedback(
  feedbackId: string,
  adminId: string,
  adminReply: string
): Promise<IFeedback> {
  if (!mongoose.Types.ObjectId.isValid(feedbackId)) {
    throw new FeedbackServiceError('Feedback ID không hợp lệ', 400);
  }

  const feedback = await Feedback.findById(feedbackId);
  if (!feedback) {
    throw new FeedbackServiceError('Không tìm thấy phản hồi', 404);
  }
  if (feedback.status !== 'PROCESSING') {
    throw new FeedbackServiceError(
      'Chỉ có thể đóng phản hồi đang ở trạng thái PROCESSING',
      400
    );
  }

  feedback.adminId = new mongoose.Types.ObjectId(adminId);
  feedback.adminReply = adminReply;
  feedback.resolvedAt = new Date();
  feedback.status = 'CLOSED';
  await feedback.save();

  await createNotification(
    feedback.userId.toString(),
    'FEEDBACK',
    'Phản hồi của bạn đã được xử lý',
    `Yêu cầu "${feedback.title}" đã được đóng. Nhấn để xem phản hồi từ admin.`,
    (feedback._id as mongoose.Types.ObjectId).toString(),
    'notifContent.feedback.closed.title',
    'notifContent.feedback.closed.body',
    { feedbackTitle: feedback.title }
  );

  const populated = await feedback.populate([
    { path: 'userId', select: 'fullName email phoneNumber avatar role' },
    { path: 'adminId', select: 'fullName email' },
  ]);
  return populated as IFeedback;
}

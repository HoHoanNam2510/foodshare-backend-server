import OpenAI from 'openai';
import logger from '@/utils/logger';
import Post, { IPost } from '@/models/Post';
import PostCreationPasscode from '@/models/PostCreationPasscode';
import Transaction from '@/models/Transaction';
import User from '@/models/User';
import { createNotification } from '@/services/notificationService';
import SystemConfig from '@/models/SystemConfig';
import AIPostModerationLog, {
  ModerationDecision,
  ModerationTrigger,
} from '@/models/AIPostModerationLog';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

const DEFAULT_REJECT_THRESHOLD = 50;
const DEFAULT_APPROVE_THRESHOLD = 70;

// --- AI Moderation ---

// Groq: OpenAI-compatible inference platform (api.groq.com). Key format: gsk_...
const groqClient = process.env.GROQ_API_KEY
  ? new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: 'https://api.groq.com/openai/v1',
    })
  : null;

if (!groqClient) {
  logger.warn('[AI Moderation] GROQ_API_KEY not set — AI moderation disabled');
} else {
  logger.info('[AI Moderation] Groq client initialized');
}

type ModerationResult = {
  trustScore: number;
  reason: string;
};

async function moderatePostWithAI(data: {
  title: string;
  description?: string;
  images: string[];
}): Promise<ModerationResult> {
  if (!groqClient) {
    return { trustScore: 60, reason: 'Grok API key chưa được cấu hình' };
  }

  const imageUrls = data.images.slice(0, 3);

  const prompt = `Bạn là chuyên gia kiểm duyệt nội dung cho ứng dụng chia sẻ thực phẩm FoodShare.
Đánh giá bài đăng và trả về điểm tín nhiệm từ 0–100.

=== TIÊU CHÍ BẮT BUỘC (vi phạm → trừ 30–50 điểm) ===
1. Phải là thực phẩm: không phải đồ vật/người/quảng cáo phi thực phẩm
2. Thống nhất nội dung: tiêu đề + mô tả + ảnh phải cùng 1 sản phẩm
3. Ngôn ngữ phù hợp: không tục tĩu, lăng mạ, kích động
4. Không lừa đảo: không quảng cáo sai sự thật
5. An toàn cơ bản: không có dấu hiệu thực phẩm hỏng/mốc rõ ràng

=== TIÊU CHÍ CHẤT LƯỢNG (trừ 5–20 điểm mỗi lỗi) ===
6. Ảnh khớp với tiêu đề món ăn
7. Mô tả không lạc đề sang sản phẩm khác
8. Ảnh trông thực tế (không phải stock photo hoàn hảo bất thường)
9. Tiêu đề đủ rõ ràng để hiểu đây là món gì
10. Thức ăn trong ảnh sạch sẽ, bảo quản đúng cách

Bài đăng:
- Tiêu đề: "${data.title}"
- Mô tả: "${data.description || '(không có mô tả)'}"
- Số ảnh: ${data.images.length}${imageUrls.length > 0 ? ` (đã đính kèm ${imageUrls.length} ảnh)` : ''}

Trả về JSON (CHỈ JSON, không thêm text):
{"trustScore": <0-100>, "reason": "<lý_do_ngắn_gọn_1_câu>"}`;

  try {
    const contentParts: OpenAI.ChatCompletionContentPart[] = [
      { type: 'text', text: prompt },
      ...imageUrls.map(
        (url): OpenAI.ChatCompletionContentPartImage => ({
          type: 'image_url',
          image_url: { url },
        })
      ),
    ];

    const response = await groqClient.chat.completions.create({
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      messages: [{ role: 'user', content: contentParts }],
      max_tokens: 300,
      temperature: 0.1,
    });

    const raw = (response.choices[0].message.content || '').trim();
    const cleaned = raw.replace(/```json\n?|```\n?/g, '').trim();
    const parsed: ModerationResult = JSON.parse(cleaned);
    const trustScore = Math.max(
      0,
      Math.min(100, Math.round(parsed.trustScore))
    );
    return { trustScore, reason: parsed.reason || 'Không có lý do cụ thể' };
  } catch (error) {
    logger.error('[AI Moderation] Groq API error:', error);
    return { trustScore: 60, reason: 'Lỗi khi gọi AI kiểm duyệt' };
  }
}

export async function runAIModerationJob(
  postId: string,
  trigger: ModerationTrigger
): Promise<ModerationDecision | null> {
  try {
    const post = await Post.findById(postId);
    if (!post || post.status !== 'PENDING_REVIEW') return null;

    const config = await SystemConfig.findOne();

    // Khi admin tắt AI moderation, không chạy cho bất kỳ trigger nào (kể cả ON_CREATE/ON_UPDATE).
    // Scheduler đã tự check enabled; guard này đảm bảo on-create/on-update cũng tuân thủ.
    if (!config?.aiModeration?.enabled) return null;

    const rejectThreshold =
      config.aiModeration.trustScoreThresholds?.reject ??
      DEFAULT_REJECT_THRESHOLD;
    const approveThreshold =
      config.aiModeration.trustScoreThresholds?.approve ??
      DEFAULT_APPROVE_THRESHOLD;

    const { trustScore, reason } = await moderatePostWithAI({
      title: post.title,
      description: post.description,
      images: post.images,
    });

    let decision: ModerationDecision;
    let newStatus: IPost['status'] | null = null;

    if (trustScore < rejectThreshold) {
      decision = 'REJECTED';
      newStatus = 'REJECTED';
    } else if (trustScore >= approveThreshold) {
      decision = 'APPROVED';
      newStatus = 'AVAILABLE';
    } else {
      decision = 'PENDING_MANUAL';
    }

    if (newStatus === 'REJECTED') {
      await Post.findByIdAndUpdate(postId, { status: 'REJECTED' });
      await createNotification(
        post.ownerId.toString(),
        'SYSTEM',
        'Bài đăng bị từ chối',
        `Bài đăng "${post.title}" đã bị từ chối. Lý do: ${reason}`,
        postId
      );
    } else if (newStatus === 'AVAILABLE') {
      await Post.findByIdAndUpdate(postId, { status: 'AVAILABLE' });
      await createNotification(
        post.ownerId.toString(),
        'SYSTEM',
        'Bài đăng đã được duyệt',
        `Bài đăng "${post.title}" đã được duyệt và xuất hiện trên bản đồ.`,
        postId
      );
    }

    await AIPostModerationLog.create({
      postId: post._id,
      postTitle: post.title,
      trustScore,
      reason,
      decision,
      trigger,
    });

    return decision;
  } catch (error) {
    logger.error(`AI moderation job failed for post ${postId}:`, error);
    return null;
  }
}

export async function runAIBatchModerationJob(
  trigger: 'BATCH_SCHEDULER' | 'MANUAL_ADMIN'
): Promise<{
  processed: number;
  approved: number;
  rejected: number;
  pendingManual: number;
}> {
  const pendingPosts = await Post.find({ status: 'PENDING_REVIEW' })
    .select('_id')
    .lean();

  const stats = { processed: 0, approved: 0, rejected: 0, pendingManual: 0 };

  for (const post of pendingPosts) {
    const decision = await runAIModerationJob(String(post._id), trigger);
    if (decision !== null) {
      stats.processed++;
      if (decision === 'APPROVED') stats.approved++;
      else if (decision === 'REJECTED') stats.rejected++;
      else stats.pendingManual++;
    }
  }

  await SystemConfig.findOneAndUpdate(
    {},
    {
      'aiModeration.lastRunAt': new Date(),
      'aiModeration.lastRunStats': stats,
    },
    { upsert: true }
  );

  return stats;
}

// --- Post Query Services ---

type SortOrder = 'asc' | 'desc';

type AdminPostListQuery = {
  status?: IPost['status'];
  type?: IPost['type'];
  page?: number;
  limit?: number;
  sortBy?: 'createdAt' | 'updatedAt';
  sortOrder?: SortOrder;
};

type AdminPostListResult = {
  posts: IPost[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export async function getAdminPostList(
  query: AdminPostListQuery
): Promise<AdminPostListResult> {
  const page = Math.max(query.page || DEFAULT_PAGE, 1);
  const limit = Math.min(Math.max(query.limit || DEFAULT_LIMIT, 1), MAX_LIMIT);
  const skip = (page - 1) * limit;

  const filter: Record<string, unknown> = {};
  if (query.status) filter.status = query.status;
  if (query.type) filter.type = query.type;

  const sortField = query.sortBy || 'createdAt';
  const sortOrder = query.sortOrder === 'asc' ? 1 : -1;

  const [posts, total] = await Promise.all([
    Post.find(filter)
      .populate('ownerId', 'fullName email avatar role')
      .sort({ [sortField]: sortOrder })
      .skip(skip)
      .limit(limit)
      .lean(),
    Post.countDocuments(filter),
  ]);

  return {
    posts: posts as IPost[],
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

// =============================================
// EXPIRY AUTO-HIDE
// =============================================

// Chuyển tất cả bài quá hạn sang HIDDEN. Gọi fire-and-forget tại các endpoint public
// để tránh cần scheduler riêng trong giai đoạn dev.
export async function expireOldPosts(): Promise<void> {
  await Post.updateMany(
    {
      status: { $in: ['AVAILABLE', 'BOOKED'] },
      expiryDate: { $lt: new Date() },
    },
    { $set: { status: 'HIDDEN' } }
  );
}

// =============================================
// HOME SCREEN
// =============================================

type HomePostType = 'P2P_FREE' | 'B2C_MYSTERY_BAG';

export interface HomePostsQuery {
  categorySlug?: string;
  lng?: number | null;
  lat?: number | null;
  limit?: number;
}

function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistanceLabel(km: number): string {
  if (km < 1) return `~${Math.round(km * 1000)} m`;
  return `~${km.toFixed(1)} km`;
}

export async function getHomePostsFeed(
  type: HomePostType,
  query: HomePostsQuery
): Promise<Array<Record<string, unknown>>> {
  const maxItems = Math.min(query.limit ?? 6, 20);
  const now = new Date();
  const filter: Record<string, unknown> = {
    status: 'AVAILABLE',
    type,
    expiryDate: { $gt: now },
  };

  if (query.categorySlug && query.categorySlug !== 'all') {
    filter.category = query.categorySlug;
  }

  const posts = await Post.find(filter)
    .populate('ownerId', 'fullName avatar averageRating role')
    .sort({ createdAt: -1 })
    .limit(maxItems)
    .lean();

  return (posts as unknown as Array<Record<string, unknown>>).map((post) => {
    const loc = post.location as IPost['location'];
    const coords = loc?.coordinates;
    let distanceLabel: string | undefined;

    if (query.lng != null && query.lat != null && coords?.length === 2) {
      const km = haversineKm(query.lat, query.lng, coords[1], coords[0]);
      distanceLabel = formatDistanceLabel(km);
    }

    return { ...post, distanceLabel };
  });
}

// =============================================
// PASSCODE — Post creation OTP
// =============================================

const POST_PASSCODE_LENGTH = 6;
const POST_PASSCODE_EXPIRE_MINUTES = 10;
const MAX_PASSCODE_SEND_PER_MINUTE = 3;

export class PostServiceError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly errorCode?: string
  ) {
    super(message);
    this.name = 'PostServiceError';
  }
}

function generateNumericPasscode(length: number): string {
  let passcode = '';
  for (let i = 0; i < length; i += 1) {
    passcode += Math.floor(Math.random() * 10).toString();
  }
  return passcode;
}

export interface PostCreationEligibility {
  email: string;
  isEmailVerified: boolean;
  authProvider: string;
  role: string;
  kycStatus?: string;
}

export async function getUserPostEligibility(
  userId: string
): Promise<PostCreationEligibility | null> {
  const user = await User.findById(userId).select(
    'email authProvider isEmailVerified role kycStatus'
  );
  if (!user) return null;
  return {
    email: user.email,
    isEmailVerified: user.isEmailVerified,
    authProvider: user.authProvider,
    role: user.role,
    kycStatus: user.kycStatus,
  };
}

export async function checkPasscodeRateLimit(userId: string): Promise<void> {
  const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
  const recentCount = await PostCreationPasscode.countDocuments({
    userId,
    createdAt: { $gte: oneMinuteAgo },
  });
  if (recentCount >= MAX_PASSCODE_SEND_PER_MINUTE) {
    throw new PostServiceError(
      'Bạn đã gửi passcode quá nhiều lần. Vui lòng thử lại sau khoảng 1 phút',
      429
    );
  }
}

export async function createPostPasscode(
  userId: string
): Promise<{ passcode: string; expiresAt: Date }> {
  const passcode = generateNumericPasscode(POST_PASSCODE_LENGTH);
  const expiresAt = new Date(
    Date.now() + POST_PASSCODE_EXPIRE_MINUTES * 60 * 1000
  );

  await PostCreationPasscode.updateMany(
    { userId, usedAt: null },
    { $set: { usedAt: new Date() } }
  );

  await PostCreationPasscode.create({ userId, code: passcode, expiresAt });

  return { passcode, expiresAt };
}

export async function validatePostPasscode(
  userId: string,
  code: string
): Promise<{ valid: boolean; passcodeId?: string }> {
  if (
    typeof code !== 'string' ||
    !new RegExp(`^\\d{${POST_PASSCODE_LENGTH}}$`).test(code)
  ) {
    return { valid: false };
  }

  const now = new Date();
  const record = await PostCreationPasscode.findOne({
    userId,
    code,
    usedAt: null,
    expiresAt: { $gt: now },
  }).sort({ createdAt: -1 });

  if (!record) return { valid: false };
  return { valid: true, passcodeId: String(record._id) };
}

export async function markPasscodeUsed(passcodeId: string): Promise<void> {
  await PostCreationPasscode.findByIdAndUpdate(passcodeId, {
    usedAt: new Date(),
  });
}

export const POST_PASSCODE_EXPIRE_MINUTES_EXPORT = POST_PASSCODE_EXPIRE_MINUTES;

// =============================================
// POST CRUD SERVICE FUNCTIONS
// =============================================

export async function getPostsByOwner(ownerId: string): Promise<IPost[]> {
  return Post.find({ ownerId }).sort({ createdAt: -1 });
}

export async function getPostById(
  postId: string,
  currentUserId?: string
): Promise<IPost | null> {
  const post = await Post.findById(postId).populate(
    'ownerId',
    'fullName avatar averageRating role'
  );

  if (!post) return null;

  const restrictedStatuses = ['HIDDEN', 'REJECTED', 'PENDING_REVIEW'];
  const isOwner =
    currentUserId &&
    String((post.ownerId as { _id?: unknown })._id || post.ownerId) ===
      currentUserId;

  if (restrictedStatuses.includes(post.status) && !isOwner) return null;

  return post;
}

export async function getAvailablePosts(
  filter: Record<string, unknown>,
  sortOption: Record<string, 1 | -1>
): Promise<IPost[]> {
  return Post.find(filter)
    .populate('ownerId', 'fullName avatar averageRating')
    .sort(sortOption)
    .limit(100);
}

export async function searchPostsNear(
  filter: Record<string, unknown>,
  sortOption: Record<string, 1 | -1>
): Promise<IPost[]> {
  return Post.find(filter)
    .populate('ownerId', 'fullName avatar averageRating role')
    .sort(sortOption);
}

export async function checkActiveTransactions(
  postId: string,
  fields: string[]
): Promise<boolean> {
  const hasQuantityOrPriceChange = fields.some((f) =>
    ['totalQuantity', 'remainingQuantity', 'price'].includes(f)
  );
  if (!hasQuantityOrPriceChange) return false;

  const count = await Transaction.countDocuments({
    postId: postId,
    status: { $in: ['PENDING', 'ACCEPTED', 'ESCROWED', 'DISPUTED'] },
  });
  return count > 0;
}

export async function getUserBankAccount(
  userId: string
): Promise<string | undefined> {
  const owner = await User.findById(userId).select('paymentInfo role');
  return owner?.paymentInfo?.bankAccountNumber;
}

export async function createPostRecord(
  postData: Record<string, unknown>
): Promise<IPost> {
  return Post.create(postData);
}

export async function updatePostRecord(
  postId: string,
  updates: Record<string, unknown>
): Promise<IPost | null> {
  return Post.findByIdAndUpdate(
    postId,
    { $set: updates },
    { new: true, runValidators: true }
  );
}

export async function getPostForOwner(
  postId: string,
  ownerId: string
): Promise<IPost | null> {
  return Post.findOne({ _id: postId, ownerId });
}

export async function adminUpdatePostRecord(
  postId: string,
  updates: Record<string, unknown>
): Promise<IPost | null> {
  return Post.findByIdAndUpdate(
    postId,
    { $set: updates },
    { new: true, runValidators: true }
  );
}

export type ToggleHideResult =
  | { ok: true; newStatus: 'AVAILABLE' | 'HIDDEN'; post: IPost }
  | { ok: false; statusCode: number; message: string; errorCode?: string };

export async function adminToggleHidePost(
  postId: string
): Promise<ToggleHideResult> {
  const post = await Post.findById(postId);
  if (!post)
    return { ok: false, statusCode: 404, message: 'Không tìm thấy bài đăng' };

  if (post.status === 'HIDDEN') {
    if (post.expiryDate && post.expiryDate < new Date()) {
      return {
        ok: false,
        statusCode: 400,
        message: 'Không thể hiển thị bài đăng đã hết hạn sử dụng',
        errorCode: 'POST_EXPIRED',
      };
    }
    if (post.remainingQuantity <= 0) {
      return {
        ok: false,
        statusCode: 400,
        message:
          'Không thể hiển thị bài đăng đã hết hàng. Hãy cập nhật số lượng trước.',
        errorCode: 'POST_OUT_OF_STOCK',
      };
    }
    post.status = 'AVAILABLE';
    await post.save();
    return { ok: true, newStatus: 'AVAILABLE', post };
  }

  const hideableStatuses = ['AVAILABLE', 'PENDING_REVIEW'];
  if (!hideableStatuses.includes(post.status)) {
    return {
      ok: false,
      statusCode: 400,
      message: `Không thể ẩn bài đăng ở trạng thái "${post.status}". Chỉ ẩn được bài đang hiển thị hoặc chờ duyệt.`,
      errorCode: 'INVALID_POST_STATUS',
    };
  }

  post.status = 'HIDDEN';
  await post.save();
  return { ok: true, newStatus: 'HIDDEN', post };
}

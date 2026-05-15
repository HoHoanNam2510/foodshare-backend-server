import OpenAI from 'openai';
import Post, { IPost } from '@/models/Post';
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
  console.warn('[AI Moderation] GROQ_API_KEY not set — AI moderation disabled');
} else {
  console.info('[AI Moderation] Groq client initialized');
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
    console.error('[AI Moderation] Groq API error:', error);
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
    console.error(`AI moderation job failed for post ${postId}:`, error);
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
  if (query.status) {
    filter.status = query.status;
  }

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

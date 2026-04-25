import axios from 'axios';
import { GoogleGenerativeAI } from '@google/generative-ai';
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

const geminiApiKey = process.env.GEMINI_API_KEY || '';

function getGeminiModel(): ReturnType<
  GoogleGenerativeAI['getGenerativeModel']
> {
  const genAI = new GoogleGenerativeAI(geminiApiKey);
  return genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
}

type ModerationResult = {
  trustScore: number;
  reason: string;
};

async function fetchImageAsBase64(
  url: string
): Promise<{ data: string; mimeType: string }> {
  const response = await axios.get<ArrayBuffer>(url, {
    responseType: 'arraybuffer',
  });
  const data = Buffer.from(response.data).toString('base64');
  const mimeType = (response.headers['content-type'] as string) || 'image/jpeg';
  return { data, mimeType };
}

async function moderatePostWithAI(data: {
  title: string;
  description?: string;
  images: string[];
}): Promise<ModerationResult> {
  if (!geminiApiKey) {
    return { trustScore: 60, reason: 'Gemini API key chưa được cấu hình' };
  }

  const model = getGeminiModel();

  // Tải tối đa 3 ảnh đầu và chuyển sang base64 để gửi Gemini Vision
  const imageParts: { inlineData: { data: string; mimeType: string } }[] = [];
  for (const url of data.images.slice(0, 3)) {
    try {
      const { data: imgData, mimeType } = await fetchImageAsBase64(url);
      imageParts.push({ inlineData: { data: imgData, mimeType } });
    } catch {
      // Bỏ qua ảnh lỗi, tiếp tục với ảnh còn lại
    }
  }

  const hasImages = imageParts.length > 0;

  const prompt = `Bạn là hệ thống kiểm duyệt nội dung cho ứng dụng chia sẻ thức ăn FoodShare.
Hãy đánh giá mức độ uy tín của bài đăng chia sẻ thức ăn sau đây trên thang điểm 0-100.

Tiêu chí đánh giá:
- Nội dung có liên quan đến thức ăn/thực phẩm không?
- Tiêu đề và mô tả có rõ ràng, hợp lệ không?
- Có dấu hiệu lừa đảo, spam, hoặc nội dung không phù hợp không?
- Có chứa ngôn ngữ thù ghét, bạo lực, hoặc nội dung nhạy cảm không?
${hasImages ? '- Ảnh đính kèm có thực sự là thức ăn/thực phẩm không? Ảnh có rõ ràng, chất lượng tốt không?' : ''}

Thông tin bài đăng:
- Tiêu đề: "${data.title}"
- Mô tả: "${data.description || 'Không có mô tả'}"
- Số lượng ảnh: ${data.images.length}${hasImages ? ` (đã phân tích ${imageParts.length} ảnh)` : ' (không thể tải ảnh để phân tích)'}

Trả về JSON theo format:
{"trustScore": <số_nguyên_0_đến_100>, "reason": "<lý_do_ngắn_gọn>"}

CHỈ trả về JSON, không thêm bất kỳ text nào khác.`;

  try {
    const contentParts = hasImages
      ? [...imageParts, { text: prompt }]
      : [{ text: prompt }];
    const result = await model.generateContent(contentParts);
    const responseText = result.response.text().trim();
    const cleanedText = responseText.replace(/```json\n?|```\n?/g, '').trim();
    const parsed: ModerationResult = JSON.parse(cleanedText);

    const trustScore = Math.max(
      0,
      Math.min(100, Math.round(parsed.trustScore))
    );
    return { trustScore, reason: parsed.reason || 'Không có lý do cụ thể' };
  } catch (error) {
    console.error('AI Moderation error:', error);
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
    const rejectThreshold =
      config?.aiModeration?.trustScoreThresholds?.reject ??
      DEFAULT_REJECT_THRESHOLD;
    const approveThreshold =
      config?.aiModeration?.trustScoreThresholds?.approve ??
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

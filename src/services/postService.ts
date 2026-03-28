import { GoogleGenerativeAI } from '@google/generative-ai';
import Post, { IPost } from '@/models/Post';
import Notification from '@/models/Notification';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

const TRUST_SCORE_REJECT_THRESHOLD = 50;
const TRUST_SCORE_AVAILABLE_THRESHOLD = 70;

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

/**
 * Gửi dữ liệu bài đăng sang Gemini API để đánh giá mức độ uy tín.
 * Trả về trustScore (0-100) và lý do.
 */
async function moderatePostWithAI(data: {
  title: string;
  description?: string;
  images: string[];
}): Promise<ModerationResult> {
  if (!geminiApiKey) {
    // Nếu chưa cấu hình API key, giữ nguyên PENDING_REVIEW để Admin duyệt thủ công
    return { trustScore: 60, reason: 'Gemini API key chưa được cấu hình' };
  }

  const model = getGeminiModel();

  const prompt = `Bạn là hệ thống kiểm duyệt nội dung cho ứng dụng chia sẻ thức ăn FoodShare.
Hãy đánh giá mức độ uy tín của bài đăng chia sẻ thức ăn sau đây trên thang điểm 0-100.

Tiêu chí đánh giá:
- Nội dung có liên quan đến thức ăn/thực phẩm không?
- Tiêu đề và mô tả có rõ ràng, hợp lệ không?
- Có dấu hiệu lừa đảo, spam, hoặc nội dung không phù hợp không?
- Có chứa ngôn ngữ thù ghét, bạo lực, hoặc nội dung nhạy cảm không?

Thông tin bài đăng:
- Tiêu đề: "${data.title}"
- Mô tả: "${data.description || 'Không có mô tả'}"
- Số lượng ảnh: ${data.images.length}

Trả về JSON theo format:
{"trustScore": <số_nguyên_0_đến_100>, "reason": "<lý_do_ngắn_gọn>"}

CHỈ trả về JSON, không thêm bất kỳ text nào khác.`;

  try {
    const result = await model.generateContent(prompt);
    const responseText = result.response.text().trim();
    // Loại bỏ markdown code block nếu có
    const cleanedText = responseText.replace(/```json\n?|```\n?/g, '').trim();
    const parsed: ModerationResult = JSON.parse(cleanedText);

    // Đảm bảo trustScore nằm trong khoảng hợp lệ
    const trustScore = Math.max(
      0,
      Math.min(100, Math.round(parsed.trustScore))
    );

    return {
      trustScore,
      reason: parsed.reason || 'Không có lý do cụ thể',
    };
  } catch (error) {
    // Nếu AI gặp lỗi, giữ nguyên PENDING_REVIEW để Admin duyệt thủ công
    console.error('AI Moderation error:', error);
    return { trustScore: 60, reason: 'Lỗi khi gọi AI kiểm duyệt' };
  }
}

/**
 * Background job: Kiểm duyệt bài đăng bằng AI và cập nhật trạng thái.
 * Được gọi sau khi tạo/sửa bài đăng mà không chặn response.
 */
export async function runAIModerationJob(postId: string): Promise<void> {
  try {
    const post = await Post.findById(postId);
    if (!post || post.status !== 'PENDING_REVIEW') return;

    const { trustScore, reason } = await moderatePostWithAI({
      title: post.title,
      description: post.description,
      images: post.images,
    });

    if (trustScore < TRUST_SCORE_REJECT_THRESHOLD) {
      // < 50%: Từ chối
      await Post.findByIdAndUpdate(postId, { status: 'REJECTED' });
      await Notification.create({
        userId: post.ownerId,
        type: 'SYSTEM',
        title: 'Bài đăng bị từ chối',
        body: `Bài đăng "${post.title}" đã bị từ chối. Lý do: ${reason}`,
        referenceId: postId,
      });
    } else if (trustScore >= TRUST_SCORE_AVAILABLE_THRESHOLD) {
      // >= 70%: Duyệt tự động
      await Post.findByIdAndUpdate(postId, { status: 'AVAILABLE' });
      await Notification.create({
        userId: post.ownerId,
        type: 'SYSTEM',
        title: 'Bài đăng đã được duyệt',
        body: `Bài đăng "${post.title}" đã được duyệt và xuất hiện trên bản đồ.`,
        referenceId: postId,
      });
    }
    // 50-69%: Giữ nguyên PENDING_REVIEW, chờ Admin duyệt thủ công
  } catch (error) {
    console.error(`AI moderation job failed for post ${postId}:`, error);
  }
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

/**
 * Lấy danh sách bài đăng cho Admin với phân trang và bộ lọc.
 */
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

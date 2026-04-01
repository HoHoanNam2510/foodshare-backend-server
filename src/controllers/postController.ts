import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Post, { IPost } from '@/models/Post';
import PostCreationPasscode from '@/models/PostCreationPasscode';
import User from '@/models/User';
import { deleteMultipleImagesByUrl } from '@/services/uploadService';
import { sendPostPasscodeEmail } from '@/utils/postPasscodeEmail';
import { runAIModerationJob, getAdminPostList } from '@/services/postService';

const POST_PASSCODE_LENGTH = 6;
const POST_PASSCODE_EXPIRE_MINUTES = 10;
const MAX_PASSCODE_SEND_PER_MINUTE = 3;

// Trường nhạy cảm — nếu user sửa thì phải gửi lại cho AI duyệt
const SENSITIVE_FIELDS = ['title', 'description', 'images'];

function generateNumericPasscode(length: number): string {
  let passcode = '';

  for (let i = 0; i < length; i += 1) {
    passcode += Math.floor(Math.random() * 10).toString();
  }

  return passcode;
}

// =============================================
// I. NHÓM HANDLER DÀNH CHO USER / STORE
// =============================================

// --- Gửi mã OTP xác thực tạo bài ---
export const sendCreatePostPasscode = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const ownerId = req.user?.id;

    if (!ownerId) {
      res.status(401).json({
        success: false,
        message: 'Bạn cần đăng nhập để thực hiện thao tác này',
      });
      return;
    }

    const user = await User.findById(ownerId).select('email');

    if (!user) {
      res.status(404).json({
        success: false,
        message: 'Không tìm thấy người dùng',
      });
      return;
    }

    const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
    const recentPasscodeCount = await PostCreationPasscode.countDocuments({
      userId: ownerId,
      createdAt: { $gte: oneMinuteAgo },
    });

    if (recentPasscodeCount >= MAX_PASSCODE_SEND_PER_MINUTE) {
      res.status(429).json({
        success: false,
        message:
          'Bạn đã gửi passcode quá nhiều lần. Vui lòng thử lại sau khoảng 1 phút',
      });
      return;
    }

    const passcode = generateNumericPasscode(POST_PASSCODE_LENGTH);
    const expiresAt = new Date(
      Date.now() + POST_PASSCODE_EXPIRE_MINUTES * 60 * 1000
    );

    // Vô hiệu các passcode cũ chưa dùng để chỉ giữ 1 mã hợp lệ gần nhất.
    await PostCreationPasscode.updateMany(
      {
        userId: ownerId,
        usedAt: null,
      },
      {
        $set: { usedAt: new Date() },
      }
    );

    const passcodeDoc = await PostCreationPasscode.create({
      userId: ownerId,
      code: passcode,
      expiresAt,
    });

    try {
      await sendPostPasscodeEmail({
        email: user.email,
        passcode,
        expiresInMinutes: POST_PASSCODE_EXPIRE_MINUTES,
      });
    } catch (emailError) {
      await PostCreationPasscode.findByIdAndDelete(passcodeDoc._id);
      throw emailError;
    }

    res.status(200).json({
      success: true,
      message: 'Đã gửi passcode xác thực tạo bài đăng qua email',
      data: {
        expiresInMinutes: POST_PASSCODE_EXPIRE_MINUTES,
      },
    });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Không thể gửi passcode';

    res.status(500).json({
      success: false,
      message: 'Lỗi server',
      error: errorMessage,
    });
  }
};

// --- PST_F02: TẠO BÀI ĐĂNG (Create Post) ---
export const createPost = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const ownerId = req.user?.id;
    const {
      type,
      category,
      title,
      description,
      images,
      totalQuantity,
      price,
      expiryDate,
      pickupTime,
      location,
      publishAt,
      passcode,
    } = req.body;

    if (!ownerId) {
      res.status(401).json({
        success: false,
        message: 'Bạn cần đăng nhập để thực hiện thao tác này',
      });
      return;
    }

    // 1. Validate cơ bản
    if (
      !title ||
      !images ||
      images.length === 0 ||
      !totalQuantity ||
      !expiryDate ||
      !pickupTime ||
      !location
    ) {
      res.status(400).json({
        success: false,
        message: 'Vui lòng điền đầy đủ các trường bắt buộc',
      });
      return;
    }

    if (
      typeof passcode !== 'string' ||
      !new RegExp(`^\\d{${POST_PASSCODE_LENGTH}}$`).test(passcode)
    ) {
      res.status(400).json({
        success: false,
        message: `Passcode phải gồm đúng ${POST_PASSCODE_LENGTH} chữ số`,
      });
      return;
    }

    const now = new Date();
    const passcodeRecord = await PostCreationPasscode.findOne({
      userId: ownerId,
      code: passcode,
      usedAt: null,
      expiresAt: { $gt: now },
    }).sort({ createdAt: -1 });

    if (!passcodeRecord) {
      res.status(400).json({
        success: false,
        message: 'Passcode không hợp lệ hoặc đã hết hạn',
      });
      return;
    }

    // 2. Tạo bài đăng mới — status mặc định là PENDING_REVIEW
    const newPost = await Post.create({
      ownerId,
      type,
      category,
      title,
      description,
      images,
      totalQuantity,
      remainingQuantity: totalQuantity,
      price: type === 'P2P_FREE' ? 0 : price || 0,
      expiryDate,
      pickupTime,
      location,
      status: 'PENDING_REVIEW',
      publishAt,
    });

    // 3. Đánh dấu passcode đã sử dụng
    passcodeRecord.usedAt = now;
    await passcodeRecord.save();

    // 4. Trả về ngay cho Frontend — không chờ AI
    res.status(201).json({
      success: true,
      message: 'Tạo bài đăng thành công',
      data: newPost,
    });

    // 5. Background Job — AI Moderation (không chặn response)
    runAIModerationJob(String(newPost._id)).catch((err) => {
      console.error('Background AI moderation failed:', err);
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Lỗi server';

    res
      .status(500)
      .json({ success: false, message: 'Lỗi server', error: errorMessage });
  }
};

// --- PST_F01: XEM DANH SÁCH BÀI ĐĂNG CỦA TÔI (Get My Posts) ---
export const getMyPosts = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const ownerId = req.user?.id;

    const posts = await Post.find({ ownerId }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      message: 'Lấy danh sách bài đăng thành công',
      data: posts,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Lỗi server';
    res
      .status(500)
      .json({ success: false, message: 'Lỗi server', error: errorMessage });
  }
};

// --- PST_F03: SỬA THÔNG TIN BÀI ĐĂNG (Update Post) ---
export const updatePost = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const postId = req.params.id;
    const ownerId = req.user?.id;

    // req.body đã được validateBody(updatePostSchema) lọc và validate trước đó
    const updates = req.body;

    const post = await Post.findOne({ _id: postId, ownerId });
    if (!post) {
      res.status(404).json({
        success: false,
        message: 'Không tìm thấy bài đăng hoặc bạn không có quyền sửa',
      });
      return;
    }

    // Xóa ảnh cũ trên Cloudinary nếu images bị thay đổi
    if (updates.images && Array.isArray(updates.images)) {
      const removedUrls = post.images.filter(
        (oldUrl: string) => !updates.images.includes(oldUrl)
      );
      if (removedUrls.length > 0) {
        deleteMultipleImagesByUrl(removedUrls).catch(() => {});
      }
    }

    // Kiểm tra xem có sửa trường nhạy cảm không → cần duyệt lại
    const hasSensitiveChange = SENSITIVE_FIELDS.some(
      (field) => field in updates
    );

    if (hasSensitiveChange) {
      updates.status = 'PENDING_REVIEW';
    }

    const updatedPost = await Post.findByIdAndUpdate(
      postId,
      { $set: updates },
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      message: 'Cập nhật bài đăng thành công',
      data: updatedPost,
    });

    // Nếu sửa trường nhạy cảm, kích hoạt lại AI moderation
    if (hasSensitiveChange && updatedPost) {
      runAIModerationJob(String(updatedPost._id)).catch((err) => {
        console.error('Background AI re-moderation failed:', err);
      });
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Lỗi server';
    res
      .status(500)
      .json({ success: false, message: 'Lỗi server', error: errorMessage });
  }
};

// --- PST_F04: XÓA BÀI ĐĂNG (Delete Post) ---
export const deletePost = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const postId = req.params.id;
    const ownerId = req.user?.id;

    const post = await Post.findOneAndDelete({ _id: postId, ownerId });

    if (!post) {
      res.status(404).json({
        success: false,
        message: 'Không tìm thấy bài đăng hoặc bạn không có quyền xóa',
      });
      return;
    }

    // Xóa tất cả ảnh của bài đăng trên Cloudinary (fire-and-forget)
    if (post.images && post.images.length > 0) {
      deleteMultipleImagesByUrl(post.images).catch(() => {});
    }

    res.status(200).json({
      success: true,
      message: 'Xóa bài đăng thành công',
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Lỗi server';
    res
      .status(500)
      .json({ success: false, message: 'Lỗi server', error: errorMessage });
  }
};

// =============================================
// II. NHÓM HANDLER PUBLIC / TÌM KIẾM BẢN ĐỒ
// =============================================

// --- Xem chi tiết 1 bài đăng (getPostDetail) ---
export const getPostDetail = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const postId = String(req.params.id);

    if (!mongoose.Types.ObjectId.isValid(postId)) {
      res.status(400).json({
        success: false,
        message: 'ID bài đăng không hợp lệ',
      });
      return;
    }

    const post = await Post.findById(postId).populate(
      'ownerId',
      'fullName avatar averageRating role'
    );

    if (!post) {
      res.status(404).json({
        success: false,
        message: 'Không tìm thấy bài đăng',
      });
      return;
    }

    // Chặn xem nếu bài đăng ở trạng thái không công khai
    // Trừ khi người gọi API chính là ownerId
    const restrictedStatuses = ['HIDDEN', 'REJECTED', 'PENDING_REVIEW'];
    const currentUserId = req.user?.id;
    const isOwner =
      currentUserId &&
      String(post.ownerId._id || post.ownerId) === currentUserId;

    if (restrictedStatuses.includes(post.status) && !isOwner) {
      res.status(404).json({
        success: false,
        message: 'Không tìm thấy bài đăng',
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Lấy chi tiết bài đăng thành công',
      data: post,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Lỗi server';
    res
      .status(500)
      .json({ success: false, message: 'Lỗi server', error: errorMessage });
  }
};

// --- PST_F05, MAP_F01-F03: TÌM BÀI ĐĂNG TRÊN BẢN ĐỒ (searchMapPosts) ---
export const searchMapPosts = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { lng, lat, distance = '5000', type, sort } = req.query;

    if (!lng || !lat) {
      res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp tọa độ lng và lat',
      });
      return;
    }

    // Chỉ hiển thị bài đăng AVAILABLE trên bản đồ
    const filter: Record<string, unknown> = {
      status: 'AVAILABLE',
      location: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [parseFloat(lng as string), parseFloat(lat as string)],
          },
          $maxDistance: parseInt(distance as string, 10),
        },
      },
    };

    // Lọc theo loại bài đăng nếu có (P2P_FREE / B2C_MYSTERY_BAG)
    if (type && typeof type === 'string') {
      filter.type = type;
    }

    // Xác định thứ tự sắp xếp
    let sortOption: Record<string, 1 | -1> = {};
    if (sort === 'newest') {
      sortOption = { createdAt: -1 };
    } else if (sort === 'expiring') {
      sortOption = { expiryDate: 1 };
    }

    const posts = await Post.find(filter)
      .populate('ownerId', 'fullName avatar averageRating role')
      .sort(sortOption);

    res.status(200).json({
      success: true,
      message: 'Lấy bài đăng xung quanh thành công',
      data: posts,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Lỗi server';
    res
      .status(500)
      .json({ success: false, message: 'Lỗi server', error: errorMessage });
  }
};

// =============================================
// III. NHÓM HANDLER DÀNH CHO ADMIN
// =============================================

// --- ADM_P01: Lấy danh sách bài đăng (Admin) ---
export const adminGetPosts = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { status, page, limit, sortBy, sortOrder } = req.query;

    const result = await getAdminPostList({
      status: status as IPost['status'] | undefined,
      page: page ? parseInt(page as string, 10) : undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      sortBy: sortBy as 'createdAt' | 'updatedAt' | undefined,
      sortOrder: sortOrder as 'asc' | 'desc' | undefined,
    });

    res.status(200).json({
      success: true,
      message: 'Lấy danh sách bài đăng thành công',
      data: result.posts,
      pagination: result.pagination,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Lỗi server';
    res
      .status(500)
      .json({ success: false, message: 'Lỗi server', error: errorMessage });
  }
};

// --- ADM_P02: Admin sửa bài đăng (bao gồm thay đổi status) ---
export const adminUpdatePost = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const postId = String(req.params.id);
    const updates = req.body;

    if (!mongoose.Types.ObjectId.isValid(postId)) {
      res.status(400).json({
        success: false,
        message: 'ID bài đăng không hợp lệ',
      });
      return;
    }

    const updatedPost = await Post.findByIdAndUpdate(
      postId,
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!updatedPost) {
      res.status(404).json({
        success: false,
        message: 'Không tìm thấy bài đăng',
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Admin cập nhật bài đăng thành công',
      data: updatedPost,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Lỗi server';
    res
      .status(500)
      .json({ success: false, message: 'Lỗi server', error: errorMessage });
  }
};

// --- ADM_P03: Admin ẩn bài đăng vi phạm ---
export const adminToggleHidePost = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const postId = String(req.params.id);

    if (!mongoose.Types.ObjectId.isValid(postId)) {
      res.status(400).json({
        success: false,
        message: 'ID bài đăng không hợp lệ',
      });
      return;
    }

    const post = await Post.findById(postId);

    if (!post) {
      res.status(404).json({
        success: false,
        message: 'Không tìm thấy bài đăng',
      });
      return;
    }

    post.status = 'HIDDEN';
    await post.save();

    res.status(200).json({
      success: true,
      message: 'Đã khóa bài viết thành công',
      data: post,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Lỗi server';
    res
      .status(500)
      .json({ success: false, message: 'Lỗi server', error: errorMessage });
  }
};

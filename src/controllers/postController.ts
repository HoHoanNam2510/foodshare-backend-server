import { Request, Response } from 'express';
import mongoose from 'mongoose';

import { deleteMultipleImagesByUrl } from '@/services/uploadService';
import { softDeletePost, SoftDeleteError } from '@/services/softDeleteService';
import { sendPostPasscodeEmail } from '@/utils/postPasscodeEmail';
import logger from '@/utils/logger';
import {
  runAIModerationJob,
  getAdminPostList,
  getHomePostsFeed,
  expireOldPosts,
  getUserPostEligibility,
  checkPasscodeRateLimit,
  createPostPasscode,
  validatePostPasscode,
  markPasscodeUsed,
  getPostsByOwner,
  getPostById,
  getAvailablePosts,
  searchPostsNear,
  checkActiveTransactions,
  getUserBankAccount,
  createPostRecord,
  updatePostRecord,
  getPostForOwner,
  adminUpdatePostRecord,
  adminToggleHidePost as toggleHidePostService,
  PostServiceError,
  POST_PASSCODE_EXPIRE_MINUTES_EXPORT as POST_PASSCODE_EXPIRE_MINUTES,
} from '@/services/postService';
import { checkAndAwardBadges } from '@/services/badgeService';
import { IPost } from '@/models/Post';

const SENSITIVE_FIELDS = ['title', 'description', 'images'];

// =============================================
// I. USER / STORE
// =============================================

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

    const user = await getUserPostEligibility(ownerId);
    if (!user) {
      res
        .status(404)
        .json({ success: false, message: 'Không tìm thấy người dùng' });
      return;
    }

    if (!user.isEmailVerified && user.authProvider !== 'GOOGLE') {
      res.status(403).json({
        success: false,
        message: 'Bạn cần xác minh email trước khi tạo bài đăng',
        errorCode: 'EMAIL_NOT_VERIFIED',
      });
      return;
    }

    if (user.role === 'STORE' && user.kycStatus !== 'VERIFIED') {
      res.status(403).json({
        success: false,
        message: 'Cửa hàng cần được xác minh KYC trước khi tạo bài đăng',
        errorCode: 'KYC_NOT_VERIFIED',
      });
      return;
    }

    await checkPasscodeRateLimit(ownerId);

    const { passcode } = await createPostPasscode(ownerId);

    sendPostPasscodeEmail({
      email: user.email,
      passcode,
      expiresInMinutes: POST_PASSCODE_EXPIRE_MINUTES,
    }).catch((sendError: unknown) =>
      logger.error('[PostController] sendPostPasscodeEmail failed', {
        userId: ownerId,
        error: sendError instanceof Error ? sendError.message : sendError,
      })
    );

    res.status(200).json({
      success: true,
      message: 'Đã gửi passcode xác thực tạo bài đăng qua email',
      data: {
        expiresInMinutes: POST_PASSCODE_EXPIRE_MINUTES,
        deliveryMethod: 'email',
      },
    });
  } catch (error: unknown) {
    if (error instanceof PostServiceError) {
      res
        .status(error.statusCode)
        .json({ success: false, message: error.message });
      return;
    }
    const errorMessage =
      error instanceof Error ? error.message : 'Không thể gửi passcode';
    res.status(500).json({
      success: false,
      message: 'Lỗi server khi gửi passcode',
      ...(process.env.NODE_ENV !== 'production' && { error: errorMessage }),
    });
  }
};

export const createPost = async (
  req: Request,
  res: Response
): Promise<void> => {
  const ownerId = req.user?.id;

  try {
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

    if (
      !title ||
      !images ||
      images.length === 0 ||
      !totalQuantity ||
      !expiryDate ||
      !pickupTime
    ) {
      res.status(400).json({
        success: false,
        message: 'Vui lòng điền đầy đủ các trường bắt buộc',
      });
      return;
    }

    const { valid, passcodeId } = await validatePostPasscode(ownerId, passcode);
    if (!valid || !passcodeId) {
      res.status(400).json({
        success: false,
        message: 'Passcode không hợp lệ hoặc đã hết hạn',
      });
      return;
    }

    if (type === 'B2C_MYSTERY_BAG') {
      const bankAccountNumber = await getUserBankAccount(ownerId);
      if (!bankAccountNumber) {
        res.status(400).json({
          success: false,
          message:
            'Bạn cần cung cấp thông tin tài khoản ngân hàng trong phần "Thông tin thanh toán" trước khi đăng túi mù.',
        });
        return;
      }
    }

    const postData: Record<string, unknown> = {
      ownerId,
      type,
      category,
      title,
      description,
      images,
      totalQuantity,
      remainingQuantity: totalQuantity,
      price: type === 'P2P_FREE' ? 0 : (price ?? 0),
      expiryDate,
      pickupTime,
      status: 'PENDING_REVIEW',
      publishAt,
    };
    if (location) postData.location = location;

    const newPost = await createPostRecord(postData);
    const newPostId = String(newPost._id);

    await markPasscodeUsed(passcodeId);

    res.status(201).json({
      success: true,
      message: 'Tạo bài đăng thành công',
      data: newPost,
    });

    if (ownerId) {
      checkAndAwardBadges(ownerId, 'POST_CREATED').catch((err: unknown) => {
        logger.warn('[createPost] badge check (POST_CREATED) failed', {
          error: err,
        });
      });
    }

    runAIModerationJob(newPostId, 'ON_CREATE').catch((err: unknown) => {
      logger.error('[createPost] Background AI moderation failed', {
        error: err,
      });
    });
  } catch (error: unknown) {
    logger.error('[createPost] Error creating post', {
      ownerId,
      errorMessage: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    if (error instanceof mongoose.Error.ValidationError) {
      const fieldErrors = Object.entries(error.errors).map(([path, err]) => ({
        path,
        message: err.message,
      }));
      res.status(400).json({
        success: false,
        message: 'Dữ liệu bài đăng không hợp lệ',
        errorCode: 'VALIDATION_ERROR',
        errors: fieldErrors,
      });
      return;
    }

    const errorMessage = error instanceof Error ? error.message : 'Lỗi server';
    res.status(500).json({
      success: false,
      message: 'Lỗi server',
      ...(process.env.NODE_ENV !== 'production' && { error: errorMessage }),
    });
    return;
  }
};

export const getMyPosts = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const ownerId = req.user?.id as string;
    const posts = await getPostsByOwner(ownerId);
    res.status(200).json({
      success: true,
      message: 'Lấy danh sách bài đăng thành công',
      data: posts,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Lỗi server';
    res.status(500).json({
      success: false,
      message: 'Lỗi server',
      ...(process.env.NODE_ENV !== 'production' && { error: errorMessage }),
    });
  }
};

export const updatePost = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const postId = String(req.params.id);
    const ownerId = req.user?.id as string;
    const updates = req.body;

    const post = await getPostForOwner(postId, ownerId);
    if (!post) {
      res.status(404).json({
        success: false,
        message: 'Không tìm thấy bài đăng hoặc bạn không có quyền sửa',
      });
      return;
    }

    const hasActiveTransactions = await checkActiveTransactions(
      String(post._id),
      Object.keys(updates)
    );
    if (hasActiveTransactions) {
      res.status(400).json({
        success: false,
        message:
          'Không thể sửa số lượng hoặc giá khi bài đăng còn giao dịch đang xử lý. Vui lòng chờ các giao dịch hoàn tất hoặc hủy trước.',
      });
      return;
    }

    if (updates.images && Array.isArray(updates.images)) {
      const removedUrls = post.images.filter(
        (oldUrl: string) => !updates.images.includes(oldUrl)
      );
      if (removedUrls.length > 0) {
        deleteMultipleImagesByUrl(removedUrls).catch(() => {});
      }
    }

    const hasSensitiveChange = SENSITIVE_FIELDS.some(
      (field) => field in updates
    );
    if (hasSensitiveChange) updates.status = 'PENDING_REVIEW';

    const updatedPost = await updatePostRecord(postId, updates);

    res.status(200).json({
      success: true,
      message: 'Cập nhật bài đăng thành công',
      data: updatedPost,
    });

    if (hasSensitiveChange && updatedPost) {
      runAIModerationJob(String(updatedPost._id), 'ON_UPDATE').catch((err) => {
        console.error('Background AI re-moderation failed:', err);
      });
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Lỗi server';
    res.status(500).json({
      success: false,
      message: 'Lỗi server',
      ...(process.env.NODE_ENV !== 'production' && { error: errorMessage }),
    });
  }
};

export const deletePost = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const postId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : req.params.id;
    const ownerId = req.user?.id;

    if (!ownerId) {
      res.status(401).json({ success: false, message: 'Bạn cần đăng nhập' });
      return;
    }

    await softDeletePost(postId, ownerId, ownerId);
    res.status(200).json({
      success: true,
      message: 'Bài đăng đã được chuyển vào thùng rác',
    });
  } catch (error: unknown) {
    if (error instanceof SoftDeleteError) {
      res
        .status(error.statusCode)
        .json({ success: false, message: error.message });
      return;
    }
    const errorMessage = error instanceof Error ? error.message : 'Lỗi server';
    res.status(500).json({
      success: false,
      message: 'Lỗi server',
      ...(process.env.NODE_ENV !== 'production' && { error: errorMessage }),
    });
  }
};

// =============================================
// II. PUBLIC / MAP
// =============================================

export const getExplorePosts = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { type, sort } = req.query;

    expireOldPosts().catch((err) =>
      logger.error('[getExplorePosts] expireOldPosts failed', { error: err })
    );

    const now = new Date();
    const filter: Record<string, unknown> = {
      status: 'AVAILABLE',
      expiryDate: { $gt: now },
    };
    if (type && typeof type === 'string') filter.type = type;

    let sortOption: Record<string, 1 | -1> = { createdAt: -1 };
    if (sort === 'expiring') sortOption = { expiryDate: 1 };

    const posts = await getAvailablePosts(filter, sortOption);
    res.status(200).json({
      success: true,
      message: 'Lấy danh sách bài đăng thành công',
      data: posts,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Lỗi server';
    res.status(500).json({
      success: false,
      message: 'Lỗi server',
      ...(process.env.NODE_ENV !== 'production' && { error: errorMessage }),
    });
  }
};

export const getPostDetail = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const postId = String(req.params.id);

    if (!mongoose.Types.ObjectId.isValid(postId)) {
      res
        .status(400)
        .json({ success: false, message: 'ID bài đăng không hợp lệ' });
      return;
    }

    const currentUserId = req.user?.id;
    const post = await getPostById(postId, currentUserId);

    if (!post) {
      res
        .status(404)
        .json({ success: false, message: 'Không tìm thấy bài đăng' });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Lấy chi tiết bài đăng thành công',
      data: post,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Lỗi server';
    res.status(500).json({
      success: false,
      message: 'Lỗi server',
      ...(process.env.NODE_ENV !== 'production' && { error: errorMessage }),
    });
  }
};

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

    const requestedDistance = parseInt(distance as string, 10);
    if (isNaN(requestedDistance) || requestedDistance > 5000) {
      res.status(400).json({
        success: false,
        message: 'Khoảng cách tìm kiếm tối đa là 5 km',
      });
      return;
    }

    expireOldPosts().catch((err) =>
      logger.error('[searchMapPosts] expireOldPosts failed', { error: err })
    );

    const now = new Date();
    const filter: Record<string, unknown> = {
      status: 'AVAILABLE',
      expiryDate: { $gt: now },
      location: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [parseFloat(lng as string), parseFloat(lat as string)],
          },
          $maxDistance: requestedDistance,
        },
      },
    };

    if (type && typeof type === 'string') filter.type = type;

    let sortOption: Record<string, 1 | -1> = {};
    if (sort === 'newest') sortOption = { createdAt: -1 };
    else if (sort === 'expiring') sortOption = { expiryDate: 1 };

    const posts = await searchPostsNear(filter, sortOption);
    res.status(200).json({
      success: true,
      message: 'Lấy bài đăng xung quanh thành công',
      data: posts,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Lỗi server';
    res.status(500).json({
      success: false,
      message: 'Lỗi server',
      ...(process.env.NODE_ENV !== 'production' && { error: errorMessage }),
    });
  }
};

// =============================================
// II-B. HOME SCREEN
// =============================================

export const getFreshlyShared = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { categorySlug, lng, lat, limit } = req.query;
    const posts = await getHomePostsFeed('P2P_FREE', {
      categorySlug: typeof categorySlug === 'string' ? categorySlug : undefined,
      lng: lng ? parseFloat(lng as string) : null,
      lat: lat ? parseFloat(lat as string) : null,
      limit: Number(limit) || 6,
    });
    res.status(200).json({
      success: true,
      message: 'Lấy danh sách bài đăng thành công',
      data: posts,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Lỗi server';
    res.status(500).json({
      success: false,
      message: 'Lỗi server',
      ...(process.env.NODE_ENV !== 'production' && { error: errorMessage }),
    });
  }
};

export const getMarketTeaser = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { categorySlug, lng, lat, limit } = req.query;
    const posts = await getHomePostsFeed('B2C_MYSTERY_BAG', {
      categorySlug: typeof categorySlug === 'string' ? categorySlug : undefined,
      lng: lng ? parseFloat(lng as string) : null,
      lat: lat ? parseFloat(lat as string) : null,
      limit: Number(limit) || 6,
    });
    res.status(200).json({
      success: true,
      message: 'Lấy danh sách bài đăng thành công',
      data: posts,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Lỗi server';
    res.status(500).json({
      success: false,
      message: 'Lỗi server',
      ...(process.env.NODE_ENV !== 'production' && { error: errorMessage }),
    });
  }
};

// =============================================
// III. ADMIN
// =============================================

export const adminGetPosts = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { status, type, page, limit, sortBy, sortOrder } = req.query;

    expireOldPosts().catch((err) =>
      logger.error('[adminGetPosts] expireOldPosts failed', { error: err })
    );

    const result = await getAdminPostList({
      status: status as IPost['status'] | undefined,
      type: type as IPost['type'] | undefined,
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
    res.status(500).json({
      success: false,
      message: 'Lỗi server',
      ...(process.env.NODE_ENV !== 'production' && { error: errorMessage }),
    });
  }
};

export const adminUpdatePost = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const postId = String(req.params.id);
    const updates = req.body;

    if (!mongoose.Types.ObjectId.isValid(postId)) {
      res
        .status(400)
        .json({ success: false, message: 'ID bài đăng không hợp lệ' });
      return;
    }

    const updatedPost = await adminUpdatePostRecord(postId, updates);

    if (!updatedPost) {
      res
        .status(404)
        .json({ success: false, message: 'Không tìm thấy bài đăng' });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Admin cập nhật bài đăng thành công',
      data: updatedPost,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Lỗi server';
    res.status(500).json({
      success: false,
      message: 'Lỗi server',
      ...(process.env.NODE_ENV !== 'production' && { error: errorMessage }),
    });
  }
};

export const adminToggleHidePost = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const postId = String(req.params.id);

    if (!mongoose.Types.ObjectId.isValid(postId)) {
      res
        .status(400)
        .json({ success: false, message: 'ID bài đăng không hợp lệ' });
      return;
    }

    const result = await toggleHidePostService(postId);

    if (!result.ok) {
      res.status(result.statusCode).json({
        success: false,
        message: result.message,
        ...(result.errorCode && { errorCode: result.errorCode }),
      });
      return;
    }

    const message =
      result.newStatus === 'AVAILABLE'
        ? 'Đã hiển thị lại bài đăng thành công'
        : 'Đã ẩn bài đăng thành công';

    res.status(200).json({ success: true, message, data: result.post });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Lỗi server';
    res.status(500).json({
      success: false,
      message: 'Lỗi server',
      ...(process.env.NODE_ENV !== 'production' && { error: errorMessage }),
    });
  }
};

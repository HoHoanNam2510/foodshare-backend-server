import { Request, Response } from 'express';
import Post from '@/models/Post';
import PostCreationPasscode from '@/models/PostCreationPasscode';
import User from '@/models/User';
import { sendPostPasscodeEmail } from '@/utils/postPasscodeEmail';

const POST_PASSCODE_LENGTH = 6;
const POST_PASSCODE_EXPIRE_MINUTES = 10;
const MAX_PASSCODE_SEND_PER_MINUTE = 3;

function generateNumericPasscode(length: number): string {
  let passcode = '';

  for (let i = 0; i < length; i += 1) {
    passcode += Math.floor(Math.random() * 10).toString();
  }

  return passcode;
}

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
    const ownerId = req.user?.id; // Lấy từ authMiddleware
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

    // 2. Tạo bài đăng mới
    const newPost = await Post.create({
      ownerId,
      type,
      category,
      title,
      description,
      images,
      totalQuantity,
      remainingQuantity: totalQuantity, // Lúc mới tạo thì còn nguyên
      price: price || 0,
      expiryDate,
      pickupTime,
      location, // Phải có dạng { type: 'Point', coordinates: [lng, lat] }
      publishAt,
    });

    passcodeRecord.usedAt = now;
    await passcodeRecord.save();

    res.status(201).json({
      success: true,
      message: 'Tạo bài đăng thành công',
      data: newPost,
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

    // Lấy bài đăng của user hiện tại, sắp xếp mới nhất lên đầu
    const posts = await Post.find({ ownerId }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      message: 'Lấy danh sách bài đăng thành công',
      data: posts,
    });
  } catch (error: any) {
    console.error('Lỗi Lấy bài đăng:', error);
    res
      .status(500)
      .json({ success: false, message: 'Lỗi server', error: error.message });
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
    const updates = req.body;

    // Tìm bài đăng để đảm bảo nó thuộc về user này
    const post = await Post.findOne({ _id: postId, ownerId });
    if (!post) {
      res.status(404).json({
        success: false,
        message: 'Không tìm thấy bài đăng hoặc bạn không có quyền sửa',
      });
      return;
    }

    // Cập nhật các trường được phép
    const updatedPost = await Post.findByIdAndUpdate(
      postId,
      { $set: updates },
      { new: true, runValidators: true } // new: true để trả về data sau khi update, runValidators để check logic Mongoose
    );

    res.status(200).json({
      success: true,
      message: 'Cập nhật bài đăng thành công',
      data: updatedPost,
    });
  } catch (error: any) {
    console.error('Lỗi Sửa bài đăng:', error);
    res
      .status(500)
      .json({ success: false, message: 'Lỗi server', error: error.message });
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

    res.status(200).json({
      success: true,
      message: 'Xóa bài đăng thành công',
    });
  } catch (error: any) {
    console.error('Lỗi Xóa bài đăng:', error);
    res
      .status(500)
      .json({ success: false, message: 'Lỗi server', error: error.message });
  }
};

// --- PST_F05 (Bonus): TÌM BÀI ĐĂNG QUANH ĐÂY (Get Nearby Posts) ---
export const getNearbyPosts = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { lng, lat, distance = 5000 } = req.query; // Mặc định tìm trong bán kính 5km

    if (!lng || !lat) {
      res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp tọa độ lng và lat',
      });
      return;
    }

    // Sử dụng index 2dsphere đã thiết lập trong Post.ts
    const posts = await Post.find({
      status: 'AVAILABLE',
      location: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [parseFloat(lng as string), parseFloat(lat as string)],
          },
          $maxDistance: parseInt(distance as string), // Tính bằng mét
        },
      },
    }).populate('ownerId', 'fullName avatar averageRating'); // Kéo thêm thông tin người đăng

    res.status(200).json({
      success: true,
      message: 'Lấy bài đăng xung quanh thành công',
      data: posts,
    });
  } catch (error: any) {
    console.error('Lỗi Tìm bài đăng xung quanh:', error);
    res
      .status(500)
      .json({ success: false, message: 'Lỗi server', error: error.message });
  }
};

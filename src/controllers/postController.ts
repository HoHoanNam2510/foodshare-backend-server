import { Request, Response } from 'express';
import Post from '@/models/Post';

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
    } = req.body;

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

    res.status(201).json({
      success: true,
      message: 'Tạo bài đăng thành công',
      data: newPost,
    });
  } catch (error: any) {
    console.error('Lỗi Tạo bài đăng:', error);
    res
      .status(500)
      .json({ success: false, message: 'Lỗi server', error: error.message });
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

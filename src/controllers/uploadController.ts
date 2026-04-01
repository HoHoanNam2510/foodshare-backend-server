import { Request, Response, NextFunction } from 'express';
import {
  uploadImage,
  uploadMultipleImages,
  deleteImageByUrl,
  deleteMultipleImagesByUrl,
} from '@/services/uploadService';

/**
 * Upload một ảnh.
 * POST /api/upload/single
 * Content-Type: multipart/form-data  —  field name: "image"
 */
export const uploadSingleImage = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({
        success: false,
        message: 'Không có file ảnh nào được gửi lên',
      });
      return;
    }

    const folder = (req.query.folder as string) || 'posts';
    const result = await uploadImage(
      req.file.buffer,
      folder as 'avatars' | 'posts' | 'kyc' | 'reports' | 'chat'
    );

    res.status(200).json({
      success: true,
      data: result,
      message: 'Upload ảnh thành công',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Upload nhiều ảnh (tối đa 5).
 * POST /api/upload/multiple
 * Content-Type: multipart/form-data  —  field name: "images"
 */
export const uploadMultipleImagesHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const files = req.files as Express.Multer.File[] | undefined;

    if (!files || files.length === 0) {
      res.status(400).json({
        success: false,
        message: 'Không có file ảnh nào được gửi lên',
      });
      return;
    }

    const folder = (req.query.folder as string) || 'posts';
    const buffers = files.map((f) => f.buffer);
    const results = await uploadMultipleImages(
      buffers,
      folder as 'avatars' | 'posts' | 'kyc' | 'reports' | 'chat'
    );

    res.status(200).json({
      success: true,
      data: results,
      message: `Upload ${results.length} ảnh thành công`,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Xóa một ảnh trên Cloudinary bằng URL.
 * DELETE /api/upload/single
 * Body: { url: string }
 */
export const deleteSingleImage = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { url } = req.body as { url?: string };

    if (!url) {
      res.status(400).json({
        success: false,
        message: 'Thiếu URL ảnh cần xóa',
      });
      return;
    }

    await deleteImageByUrl(url);

    res.status(200).json({
      success: true,
      message: 'Xóa ảnh thành công',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Xóa nhiều ảnh trên Cloudinary bằng URL.
 * DELETE /api/upload/multiple
 * Body: { urls: string[] }
 */
export const deleteMultipleImagesHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { urls } = req.body as { urls?: string[] };

    if (!urls || urls.length === 0) {
      res.status(400).json({
        success: false,
        message: 'Thiếu danh sách URL ảnh cần xóa',
      });
      return;
    }

    await deleteMultipleImagesByUrl(urls);

    res.status(200).json({
      success: true,
      message: `Xóa ${urls.length} ảnh thành công`,
    });
  } catch (error) {
    next(error);
  }
};

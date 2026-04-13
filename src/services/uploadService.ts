import cloudinary from '@/config/cloudinary';

type UploadFolder = 'avatars' | 'posts' | 'kyc' | 'reports' | 'chat' | 'badges';

interface UploadResult {
  url: string;
  publicId: string;
}

/**
 * Upload một file ảnh lên Cloudinary từ buffer.
 *
 * @param fileBuffer - Buffer dữ liệu ảnh
 * @param folder - Thư mục lưu trên Cloudinary (avatars, posts, kyc, reports, chat)
 * @returns URL và publicId của ảnh đã upload
 */
export async function uploadImage(
  fileBuffer: Buffer,
  folder: UploadFolder
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: `foodshare/${folder}`,
        resource_type: 'image',
        transformation: [{ quality: 'auto', fetch_format: 'auto' }],
      },
      (error, result) => {
        if (error || !result) {
          const err = new Error('Upload ảnh thất bại');
          (err as Error & { statusCode?: number }).statusCode = 500;
          reject(err);
          return;
        }
        resolve({
          url: result.secure_url,
          publicId: result.public_id,
        });
      }
    );
    uploadStream.end(fileBuffer);
  });
}

/**
 * Upload nhiều ảnh cùng lúc.
 *
 * @param files - Mảng các file buffer
 * @param folder - Thư mục lưu trên Cloudinary
 * @returns Mảng URL và publicId
 */
export async function uploadMultipleImages(
  files: Buffer[],
  folder: UploadFolder
): Promise<UploadResult[]> {
  const uploadPromises = files.map((buffer) => uploadImage(buffer, folder));
  return Promise.all(uploadPromises);
}

/**
 * Trích xuất publicId từ Cloudinary URL.
 * VD: "https://res.cloudinary.com/xxx/image/upload/v123/foodshare/avatars/abc.jpg"
 *     → "foodshare/avatars/abc"
 *
 * Trả về null nếu URL không phải Cloudinary.
 */
export function extractPublicId(url: string): string | null {
  if (!url || !url.includes('res.cloudinary.com')) return null;

  const match = url.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.\w+)?$/);
  return match ? match[1] : null;
}

/**
 * Xóa một ảnh trên Cloudinary theo publicId.
 */
export async function deleteImage(publicId: string): Promise<void> {
  await cloudinary.uploader.destroy(publicId);
}

/**
 * Xóa một ảnh trên Cloudinary bằng URL (tự extract publicId).
 * Bỏ qua nếu URL không phải Cloudinary.
 */
export async function deleteImageByUrl(url: string): Promise<void> {
  const publicId = extractPublicId(url);
  if (!publicId) return;
  await cloudinary.uploader.destroy(publicId);
}

/**
 * Xóa nhiều ảnh cùng lúc theo publicId.
 */
export async function deleteMultipleImages(publicIds: string[]): Promise<void> {
  if (publicIds.length === 0) return;
  await cloudinary.api.delete_resources(publicIds);
}

/**
 * Xóa nhiều ảnh cùng lúc bằng URL (tự extract publicId).
 * Chỉ xóa những URL thuộc Cloudinary, bỏ qua URL khác.
 */
export async function deleteMultipleImagesByUrl(urls: string[]): Promise<void> {
  const publicIds = urls
    .map(extractPublicId)
    .filter((id): id is string => id !== null);
  if (publicIds.length === 0) return;
  await cloudinary.api.delete_resources(publicIds);
}

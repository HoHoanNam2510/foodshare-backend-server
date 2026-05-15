import mongoose from 'mongoose';
import PostTemplate, { IPostTemplate } from '@/models/PostTemplate';
import {
  CreatePostTemplateBody,
  UpdatePostTemplateBody,
} from '@/validations/postTemplateValidation';

const MAX_TEMPLATES_PER_USER = 20;

export async function getMyTemplates(
  ownerId: string
): Promise<IPostTemplate[]> {
  return PostTemplate.find({ ownerId }).sort({ createdAt: -1 }).lean();
}

export async function createTemplate(
  ownerId: string,
  data: CreatePostTemplateBody
): Promise<IPostTemplate> {
  const count = await PostTemplate.countDocuments({ ownerId });
  if (count >= MAX_TEMPLATES_PER_USER) {
    const err = new Error(
      `Bạn chỉ được lưu tối đa ${MAX_TEMPLATES_PER_USER} mẫu bài đăng`
    ) as Error & { statusCode: number };
    err.statusCode = 400;
    throw err;
  }

  const template = await PostTemplate.create({ ownerId, ...data });
  return template;
}

export async function updateTemplate(
  templateId: string,
  ownerId: string,
  data: UpdatePostTemplateBody
): Promise<IPostTemplate> {
  if (!mongoose.isValidObjectId(templateId)) {
    const err = new Error('ID mẫu không hợp lệ') as Error & {
      statusCode: number;
    };
    err.statusCode = 400;
    throw err;
  }

  const template = await PostTemplate.findOne({ _id: templateId, ownerId });
  if (!template) {
    const err = new Error(
      'Không tìm thấy mẫu hoặc bạn không có quyền chỉnh sửa'
    ) as Error & { statusCode: number };
    err.statusCode = 404;
    throw err;
  }

  // Validate price/type consistency when either field is being updated
  const resolvedType = data.type ?? template.type;
  const resolvedPrice = data.price ?? template.price;
  if (resolvedType === 'P2P_FREE' && resolvedPrice !== 0) {
    const err = new Error(
      'Giá không hợp lệ với loại bài đăng (P2P phải = 0)'
    ) as Error & { statusCode: number };
    err.statusCode = 400;
    throw err;
  }
  if (resolvedType === 'B2C_MYSTERY_BAG' && resolvedPrice <= 0) {
    const err = new Error(
      'Giá không hợp lệ với loại bài đăng (B2C phải > 0)'
    ) as Error & { statusCode: number };
    err.statusCode = 400;
    throw err;
  }

  Object.assign(template, data);
  await template.save();
  return template;
}

export async function deleteTemplate(
  templateId: string,
  ownerId: string
): Promise<void> {
  if (!mongoose.isValidObjectId(templateId)) {
    const err = new Error('ID mẫu không hợp lệ') as Error & {
      statusCode: number;
    };
    err.statusCode = 400;
    throw err;
  }

  const result = await PostTemplate.deleteOne({ _id: templateId, ownerId });
  if (result.deletedCount === 0) {
    const err = new Error(
      'Không tìm thấy mẫu hoặc bạn không có quyền xóa'
    ) as Error & { statusCode: number };
    err.statusCode = 404;
    throw err;
  }
}

import { Request, Response } from 'express';
import {
  getMyTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
} from '@/services/postTemplateService';

export const getMyTemplatesHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const ownerId = req.user?.id;
    if (!ownerId) {
      res.status(401).json({ success: false, message: 'Bạn cần đăng nhập' });
      return;
    }

    const templates = await getMyTemplates(ownerId);
    res.json({ success: true, data: templates });
  } catch (err) {
    const error = err as Error & { statusCode?: number };
    res
      .status(error.statusCode || 500)
      .json({ success: false, message: error.message });
  }
};

export const createTemplateHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const ownerId = req.user?.id;
    if (!ownerId) {
      res.status(401).json({ success: false, message: 'Bạn cần đăng nhập' });
      return;
    }

    const template = await createTemplate(ownerId, req.body);
    res.status(201).json({
      success: true,
      data: template,
      message: 'Đã lưu mẫu bài đăng thành công',
    });
  } catch (err) {
    const error = err as Error & { statusCode?: number };
    res
      .status(error.statusCode || 500)
      .json({ success: false, message: error.message });
  }
};

export const updateTemplateHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const ownerId = req.user?.id;
    if (!ownerId) {
      res.status(401).json({ success: false, message: 'Bạn cần đăng nhập' });
      return;
    }

    const template = await updateTemplate(
      req.params.id as string,
      ownerId,
      req.body
    );
    res.json({
      success: true,
      data: template,
      message: 'Đã cập nhật mẫu thành công',
    });
  } catch (err) {
    const error = err as Error & { statusCode?: number };
    res
      .status(error.statusCode || 500)
      .json({ success: false, message: error.message });
  }
};

export const deleteTemplateHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const ownerId = req.user?.id;
    if (!ownerId) {
      res.status(401).json({ success: false, message: 'Bạn cần đăng nhập' });
      return;
    }

    await deleteTemplate(req.params.id as string, ownerId);
    res.json({ success: true, message: 'Đã xóa mẫu thành công' });
  } catch (err) {
    const error = err as Error & { statusCode?: number };
    res
      .status(error.statusCode || 500)
      .json({ success: false, message: error.message });
  }
};

import { Request, Response } from 'express';

import {
  SoftDeleteError,
  UserTrashCollection,
  getMyTrashItems,
  restoreItemByOwner,
  purgeItemByOwner,
} from '@/services/softDeleteService';

function handleError(error: unknown, res: Response): void {
  if (error instanceof SoftDeleteError) {
    res.status(error.statusCode).json({ success: false, message: error.message });
    return;
  }
  const message = error instanceof Error ? error.message : 'Lỗi không xác định';
  res.status(500).json({ success: false, message });
}

// [GET] /api/auth/me/trash?collection=posts|reviews|vouchers&page=1&limit=20
export async function getMyTrash(req: Request, res: Response): Promise<void> {
  try {
    const ownerId = req.user!.id;
    const collection = req.query.collection as UserTrashCollection | undefined;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    const results = await getMyTrashItems(ownerId, collection, page, limit);

    if (collection) {
      const single = results[0];
      res.json({ success: true, data: single.data, pagination: single.pagination });
    } else {
      res.json({ success: true, data: results });
    }
  } catch (error) {
    handleError(error, res);
  }
}

// [POST] /api/auth/me/trash/restore/:collection/:id
export async function restoreMyItem(req: Request, res: Response): Promise<void> {
  try {
    const ownerId = req.user!.id;
    const { collection, id } = req.params as { collection: UserTrashCollection; id: string };

    await restoreItemByOwner(collection, id, ownerId);

    res.json({ success: true, message: 'Khôi phục thành công' });
  } catch (error) {
    handleError(error, res);
  }
}

// [DELETE] /api/auth/me/trash/purge/:collection/:id
export async function purgeMyItem(req: Request, res: Response): Promise<void> {
  try {
    const ownerId = req.user!.id;
    const { collection, id } = req.params as { collection: UserTrashCollection; id: string };

    await purgeItemByOwner(collection, id, ownerId);

    res.json({ success: true, message: 'Xóa vĩnh viễn thành công' });
  } catch (error) {
    handleError(error, res);
  }
}

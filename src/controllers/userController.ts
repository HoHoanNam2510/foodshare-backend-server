import { Request, Response } from 'express';

import {
  UserServiceError,
  createUser as createUserService,
  getUsers as getUsersService,
  getUserById as getUserByIdService,
  updateUser as updateUserService,
  deleteUser as deleteUserService,
  reviewKyc as reviewKycService,
} from '@/services/userService';
import { checkAndAwardBadges } from '@/services/badgeService';

function getParamAsString(value: string | string[] | undefined): string {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value) && value.length > 0) {
    return value[0];
  }

  return '';
}

function handleUserError(error: unknown, res: Response): void {
  if (error instanceof UserServiceError) {
    res.status(error.statusCode).json({
      success: false,
      message: error.message,
    });
    return;
  }

  res.status(500).json({
    success: false,
    message: 'Lỗi server',
  });
}

export const createUser = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const user = await createUserService(req.body);

    res.status(201).json({
      success: true,
      message: 'Tạo người dùng thành công',
      data: user,
    });
  } catch (error: unknown) {
    handleUserError(error, res);
  }
};

export const getUsers = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await getUsersService(req.query);

    res.status(200).json({
      success: true,
      message: 'Lấy danh sách người dùng thành công',
      data: result.users,
      pagination: result.pagination,
    });
  } catch (error: unknown) {
    handleUserError(error, res);
  }
};

export const getUserById = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const id = getParamAsString(req.params.id);
    const user = await getUserByIdService(id);

    res.status(200).json({
      success: true,
      message: 'Lấy chi tiết người dùng thành công',
      data: user,
    });
  } catch (error: unknown) {
    handleUserError(error, res);
  }
};

export const updateUser = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const id = getParamAsString(req.params.id);
    const user = await updateUserService(id, req.body);

    res.status(200).json({
      success: true,
      message: 'Cập nhật người dùng thành công',
      data: user,
    });
  } catch (error: unknown) {
    handleUserError(error, res);
  }
};

export const reviewKyc = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const id = getParamAsString(req.params.id);
    const { action, rejectionReason } = req.body;
    const user = await reviewKycService(id, action, rejectionReason);

    const message =
      action === 'APPROVE'
        ? 'Đã duyệt đăng ký cửa hàng thành công'
        : 'Đã từ chối đăng ký cửa hàng';

    res.status(200).json({
      success: true,
      message,
      data: user,
    });

    // Trigger KYC_APPROVED badge check nếu admin duyệt thành công
    if (action === 'APPROVE') {
      try {
        await checkAndAwardBadges(id, 'KYC_APPROVED');
      } catch (err) {
        console.warn('[UserController] badge check (KYC_APPROVED) failed:', err);
      }
    }
  } catch (error: unknown) {
    handleUserError(error, res);
  }
};

export const deleteUser = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const id = getParamAsString(req.params.id);
    const requesterId = req.user!.id;
    await deleteUserService(id, requesterId);

    res.status(204).send();
  } catch (error: unknown) {
    handleUserError(error, res);
  }
};

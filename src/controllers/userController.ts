import { Request, Response } from 'express';

import {
  UserServiceError,
  createUser as createUserService,
  getUsers as getUsersService,
  getUserById as getUserByIdService,
  updateUser as updateUserService,
  deleteUser as deleteUserService,
} from '@/services/userService';

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

export const deleteUser = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const id = getParamAsString(req.params.id);
    await deleteUserService(id);

    res.status(204).send();
  } catch (error: unknown) {
    handleUserError(error, res);
  }
};

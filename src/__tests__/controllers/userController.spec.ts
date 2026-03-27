import { Request, Response } from 'express';

import {
  createUser,
  deleteUser,
  getUserById,
  getUsers,
  updateUser,
} from '@/controllers/userController';
import {
  UserServiceError,
  createUser as createUserService,
  deleteUser as deleteUserService,
  getUserById as getUserByIdService,
  getUsers as getUsersService,
  updateUser as updateUserService,
} from '@/services/userService';

jest.mock('@/services/userService', () => ({
  __esModule: true,
  UserServiceError: class extends Error {
    statusCode: number;

    constructor(message: string, statusCode: number) {
      super(message);
      this.statusCode = statusCode;
    }
  },
  createUser: jest.fn(),
  getUsers: jest.fn(),
  getUserById: jest.fn(),
  updateUser: jest.fn(),
  deleteUser: jest.fn(),
}));

describe('userController', () => {
  const mockedCreateUserService = createUserService as jest.Mock;
  const mockedGetUsersService = getUsersService as jest.Mock;
  const mockedGetUserByIdService = getUserByIdService as jest.Mock;
  const mockedUpdateUserService = updateUserService as jest.Mock;
  const mockedDeleteUserService = deleteUserService as jest.Mock;

  const createResponse = (): Response => {
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };

    return res as unknown as Response;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('createUser returns 201 on success', async () => {
    const req = {
      body: { email: 'admin@test.com', fullName: 'Admin User' },
    } as Request;
    const res = createResponse();

    mockedCreateUserService.mockResolvedValue({
      _id: 'u1',
      email: 'admin@test.com',
    });

    await createUser(req, res);

    expect(mockedCreateUserService).toHaveBeenCalledWith(req.body);
    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(201);
    expect(res.json as unknown as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
      })
    );
  });

  it('getUsers returns list and pagination', async () => {
    const req = {
      query: { page: 1, limit: 10 },
    } as unknown as Request;
    const res = createResponse();

    mockedGetUsersService.mockResolvedValue({
      users: [{ _id: 'u1' }],
      pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
    });

    await getUsers(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(200);
    expect(res.json as unknown as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        pagination: expect.objectContaining({ total: 1 }),
      })
    );
  });

  it('getUserById returns 404 with service error', async () => {
    const req = {
      params: { id: '507f191e810c19729de860ea' },
    } as unknown as Request;
    const res = createResponse();

    mockedGetUserByIdService.mockRejectedValue(
      new UserServiceError('Không tìm thấy người dùng', 404)
    );

    await getUserById(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(404);
    expect(res.json as unknown as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
      })
    );
  });

  it('updateUser returns 500 on unexpected error', async () => {
    const req = {
      params: { id: '507f191e810c19729de860ea' },
      body: { fullName: 'Updated Name' },
    } as unknown as Request;
    const res = createResponse();

    mockedUpdateUserService.mockRejectedValue(new Error('DB crashed'));

    await updateUser(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(500);
    expect(res.json as unknown as jest.Mock).toHaveBeenCalledWith({
      success: false,
      message: 'Lỗi server',
    });
  });

  it('deleteUser returns 204 on success', async () => {
    const req = {
      params: { id: '507f191e810c19729de860ea' },
    } as unknown as Request;
    const res = createResponse();

    mockedDeleteUserService.mockResolvedValue({ _id: 'u1' });

    await deleteUser(req, res);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(204);
    expect(res.send as unknown as jest.Mock).toHaveBeenCalled();
  });
});

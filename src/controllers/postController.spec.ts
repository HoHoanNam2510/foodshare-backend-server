import { Request, Response } from 'express';

import {
  createPost,
  sendCreatePostPasscode,
} from '@/controllers/postController';
import Post from '@/models/Post';
import PostCreationPasscode from '@/models/PostCreationPasscode';
import User from '@/models/User';
import { sendPostPasscodeEmail } from '@/utils/postPasscodeEmail';

jest.mock('@/models/Post', () => ({
  __esModule: true,
  default: {
    create: jest.fn(),
  },
}));

jest.mock('@/models/PostCreationPasscode', () => ({
  __esModule: true,
  default: {
    countDocuments: jest.fn(),
    updateMany: jest.fn(),
    create: jest.fn(),
    findByIdAndDelete: jest.fn(),
    findOne: jest.fn(),
  },
}));

jest.mock('@/models/User', () => ({
  __esModule: true,
  default: {
    findById: jest.fn(),
  },
}));

jest.mock('@/utils/postPasscodeEmail', () => ({
  __esModule: true,
  sendPostPasscodeEmail: jest.fn(),
}));

describe('createPost', () => {
  const mockedPost = Post as unknown as {
    create: jest.Mock;
  };

  const mockedPasscodeModel = PostCreationPasscode as unknown as {
    countDocuments: jest.Mock;
    updateMany: jest.Mock;
    create: jest.Mock;
    findByIdAndDelete: jest.Mock;
    findOne: jest.Mock;
  };

  const mockedUser = User as unknown as {
    findById: jest.Mock;
  };

  const mockedSendPostPasscodeEmail = sendPostPasscodeEmail as jest.Mock;

  const createResponse = (): Response => {
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    return res as unknown as Response;
  };

  const createRequest = (passcode: string): Request => {
    return {
      user: { id: '507f191e810c19729de860ea', role: 'USER' },
      body: {
        type: 'DONATION',
        category: 'FOOD',
        title: 'Com hop',
        description: 'Com hop con moi',
        images: ['https://image.test/1.png'],
        totalQuantity: 5,
        price: 0,
        expiryDate: '2026-03-31T10:00:00.000Z',
        pickupTime: '17:00-19:00',
        location: { type: 'Point', coordinates: [106.7, 10.7] },
        publishAt: '2026-03-24T10:00:00.000Z',
        passcode,
      },
    } as unknown as Request;
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockedPasscodeModel.countDocuments.mockResolvedValue(0);
    mockedPasscodeModel.updateMany.mockResolvedValue(undefined);
    mockedPasscodeModel.findByIdAndDelete.mockResolvedValue(undefined);
    mockedSendPostPasscodeEmail.mockResolvedValue(undefined);
  });

  it('creates post successfully when passcode is valid', async () => {
    const req = createRequest('123456');
    const res = createResponse();

    const save = jest.fn().mockResolvedValue(undefined);
    const passcodeRecord = { usedAt: null, save };

    mockedPasscodeModel.findOne.mockReturnValue({
      sort: jest.fn().mockResolvedValue(passcodeRecord),
    });
    mockedPost.create.mockResolvedValue({ _id: 'post-id-1', title: 'Com hop' });

    await createPost(req, res);

    expect(mockedPasscodeModel.findOne).toHaveBeenCalled();
    expect(mockedPost.create).toHaveBeenCalled();
    expect(save).toHaveBeenCalled();
    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(201);
  });

  it('returns 400 when passcode format is invalid', async () => {
    const req = createRequest('12AB56');
    const res = createResponse();

    await createPost(req, res);

    expect(mockedPasscodeModel.findOne).not.toHaveBeenCalled();
    expect(mockedPost.create).not.toHaveBeenCalled();
    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(400);
    expect(res.json as unknown as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
      })
    );
  });

  it('returns 400 when passcode is expired or not found', async () => {
    const req = createRequest('654321');
    const res = createResponse();

    mockedPasscodeModel.findOne.mockReturnValue({
      sort: jest.fn().mockResolvedValue(null),
    });

    await createPost(req, res);

    expect(mockedPasscodeModel.findOne).toHaveBeenCalled();
    expect(mockedPost.create).not.toHaveBeenCalled();
    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(400);
    expect(res.json as unknown as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: 'Passcode không hợp lệ hoặc đã hết hạn',
      })
    );
  });

  it('sends passcode email successfully', async () => {
    const req = {
      user: { id: '507f191e810c19729de860ea', role: 'USER' },
      body: {},
    } as Request;
    const res = createResponse();

    mockedUser.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({ email: 'user@example.com' }),
    });
    mockedPasscodeModel.create.mockResolvedValue({ _id: 'passcode-doc-id' });

    await sendCreatePostPasscode(req, res);

    expect(mockedPasscodeModel.countDocuments).toHaveBeenCalled();
    expect(mockedPasscodeModel.updateMany).toHaveBeenCalled();
    expect(mockedPasscodeModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: '507f191e810c19729de860ea',
        code: expect.stringMatching(/^\d{6}$/),
      })
    );
    expect(mockedSendPostPasscodeEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'user@example.com',
      })
    );
    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(200);
  });

  it('rolls back saved passcode when email send fails', async () => {
    const req = {
      user: { id: '507f191e810c19729de860ea', role: 'USER' },
      body: {},
    } as Request;
    const res = createResponse();

    mockedUser.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({ email: 'user@example.com' }),
    });
    mockedPasscodeModel.create.mockResolvedValue({ _id: 'passcode-doc-id' });
    mockedSendPostPasscodeEmail.mockRejectedValue(new Error('SMTP error'));

    await sendCreatePostPasscode(req, res);

    expect(mockedPasscodeModel.findByIdAndDelete).toHaveBeenCalledWith(
      'passcode-doc-id'
    );
    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(500);
  });
});

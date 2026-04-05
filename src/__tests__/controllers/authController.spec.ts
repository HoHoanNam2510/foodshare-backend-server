import { Request, Response } from 'express';

import {
  completeProfile,
  googleLogin,
  login,
  registerSendCode,
  registerVerify,
  setPassword,
} from '@/controllers/authController';
import User from '@/models/User';
import PendingRegistration from '@/models/PendingRegistration';
import { verifyGoogleIdToken } from '@/utils/googleAuth';
import { comparePassword, generateToken, hashPassword } from '@/utils/auth';
import { sendVerificationEmail } from '@/utils/emailVerification';

jest.mock('@/models/User', () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(),
    create: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    findById: jest.fn(),
  },
}));

jest.mock('@/utils/googleAuth', () => ({
  __esModule: true,
  verifyGoogleIdToken: jest.fn(),
}));

jest.mock('@/utils/auth', () => ({
  __esModule: true,
  hashPassword: jest.fn(),
  comparePassword: jest.fn(),
  generateToken: jest.fn(),
}));

jest.mock('@/models/PendingRegistration', () => ({
  __esModule: true,
  default: {
    countDocuments: jest.fn(),
    deleteMany: jest.fn(),
    create: jest.fn(),
    findOne: jest.fn(),
    findByIdAndDelete: jest.fn(),
  },
}));

jest.mock('@/utils/emailVerification', () => ({
  __esModule: true,
  sendVerificationEmail: jest.fn(),
}));

describe('authController', () => {
  const mockedUserModel = User as unknown as {
    findOne: jest.Mock;
    create: jest.Mock;
    findByIdAndUpdate: jest.Mock;
    findById: jest.Mock;
  };

  const mockedPendingRegistration = PendingRegistration as unknown as {
    countDocuments: jest.Mock;
    deleteMany: jest.Mock;
    create: jest.Mock;
    findOne: jest.Mock;
    findByIdAndDelete: jest.Mock;
  };

  const mockedVerifyGoogleIdToken = verifyGoogleIdToken as jest.Mock;
  const mockedHashPassword = hashPassword as jest.Mock;
  const mockedComparePassword = comparePassword as jest.Mock;
  const mockedGenerateToken = generateToken as jest.Mock;
  const mockedSendVerificationEmail = sendVerificationEmail as jest.Mock;

  const createResponse = (): Response => {
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    return res as unknown as Response;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sends verification code on register step 1', async () => {
    const req = {
      body: {
        email: 'new.user@example.com',
        password: 'secret123',
        fullName: 'New User',
      },
    } as Request;
    const res = createResponse();

    mockedUserModel.findOne.mockResolvedValue(null);
    mockedHashPassword.mockResolvedValue('hashed-password');
    mockedPendingRegistration.countDocuments.mockResolvedValue(0);
    mockedPendingRegistration.deleteMany.mockResolvedValue({});
    mockedPendingRegistration.create.mockResolvedValue({
      _id: 'pending-id',
      email: 'new.user@example.com',
    });
    mockedSendVerificationEmail.mockResolvedValue(undefined);

    await registerSendCode(req, res);

    expect(mockedPendingRegistration.create).toHaveBeenCalled();
    expect(mockedSendVerificationEmail).toHaveBeenCalled();
    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(200);
    expect(res.json as unknown as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({ success: true })
    );
  });

  it('creates account on register step 2 with valid code', async () => {
    const req = {
      body: {
        email: 'new.user@example.com',
        code: '123456',
      },
    } as Request;
    const res = createResponse();

    mockedPendingRegistration.findOne.mockResolvedValue({
      email: 'new.user@example.com',
      fullName: 'New User',
      phoneNumber: '',
      hashedPassword: 'hashed-password',
    });
    mockedUserModel.findOne.mockResolvedValue(null);
    mockedUserModel.create.mockResolvedValue({
      _id: { toString: () => 'user-id-new' },
      role: 'USER',
      isProfileCompleted: false,
      toObject: () => ({ email: 'new.user@example.com' }),
    });
    mockedPendingRegistration.deleteMany.mockResolvedValue({});
    mockedGenerateToken.mockReturnValue('jwt-token');

    await registerVerify(req, res);

    expect(mockedUserModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        authProvider: 'LOCAL',
        isEmailVerified: true,
      })
    );
    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(201);
    expect(res.json as unknown as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        token: 'jwt-token',
      })
    );
  });

  it('logs in a local user successfully', async () => {
    const req = {
      body: {
        email: 'local.user@example.com',
        password: 'secret123',
      },
    } as Request;
    const res = createResponse();

    const userDoc = {
      _id: { toString: () => 'user-id-1' },
      role: 'USER',
      status: 'ACTIVE',
      authProvider: 'LOCAL',
      password: 'hashed-password',
      isProfileCompleted: true,
      toObject: () => ({ email: 'local.user@example.com' }),
    };

    mockedUserModel.findOne.mockReturnValue({
      select: jest.fn().mockResolvedValue(userDoc),
    });
    mockedComparePassword.mockResolvedValue(true);
    mockedGenerateToken.mockReturnValue('jwt-token');

    await login(req, res);

    expect(mockedComparePassword).toHaveBeenCalledWith(
      'secret123',
      'hashed-password'
    );
    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(200);
    expect(res.json as unknown as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        token: 'jwt-token',
        onboardingRequired: false,
      })
    );
  });

  it('creates user on first google login', async () => {
    const req = {
      body: {
        idToken: 'google-id-token',
      },
    } as Request;
    const res = createResponse();

    mockedVerifyGoogleIdToken.mockResolvedValue({
      googleId: 'google-user-123',
      email: 'google.user@example.com',
      fullName: 'Google User',
      avatar: 'https://avatar.test/google.png',
    });

    mockedUserModel.findOne.mockReturnValue({
      select: jest.fn().mockResolvedValue(null),
    });

    mockedUserModel.create.mockResolvedValue({
      _id: { toString: () => 'user-id-google' },
      role: 'USER',
      isProfileCompleted: false,
      toObject: () => ({ email: 'google.user@example.com' }),
    });

    mockedGenerateToken.mockReturnValue('google-jwt-token');

    await googleLogin(req, res);

    expect(mockedUserModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        authProvider: 'GOOGLE',
        isProfileCompleted: false,
      })
    );

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(200);
    expect(res.json as unknown as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        token: 'google-jwt-token',
        onboardingRequired: true,
      })
    );
  });

  it('completes profile and sets isProfileCompleted', async () => {
    const req = {
      user: { id: 'user-id-1', role: 'USER' },
      body: {
        phoneNumber: '0909123123',
        defaultAddress: '123 Nguyen Trai, Q1',
      },
    } as Request;
    const res = createResponse();

    mockedUserModel.findOne.mockResolvedValue(null);
    mockedUserModel.findByIdAndUpdate.mockResolvedValue({
      isProfileCompleted: true,
      toObject: () => ({
        phoneNumber: '0909123123',
        defaultAddress: '123 Nguyen Trai, Q1',
      }),
    });

    await completeProfile(req, res);

    expect(mockedUserModel.findByIdAndUpdate).toHaveBeenCalledWith(
      'user-id-1',
      expect.objectContaining({
        $set: expect.objectContaining({
          isProfileCompleted: true,
        }),
      }),
      { new: true }
    );
    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(200);
    expect(res.json as unknown as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        onboardingRequired: false,
      })
    );
  });

  it('sets password for google account', async () => {
    const req = {
      user: { id: 'google-user-id', role: 'USER' },
      body: {
        newPassword: 'newSecret123',
      },
    } as Request;
    const res = createResponse();

    const save = jest.fn().mockResolvedValue(undefined);
    const userDoc = {
      authProvider: 'GOOGLE',
      password: undefined,
      save,
      toObject: () => ({ email: 'google.user@example.com' }),
    };

    mockedUserModel.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue(userDoc),
    });
    mockedHashPassword.mockResolvedValue('new-hashed-password');

    await setPassword(req, res);

    expect(mockedHashPassword).toHaveBeenCalledWith('newSecret123');
    expect(save).toHaveBeenCalled();
    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(200);
    expect(res.json as unknown as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
      })
    );
  });
});

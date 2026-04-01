import { Request, Response, NextFunction } from 'express';

import {
  uploadSingleImage,
  uploadMultipleImagesHandler,
  deleteSingleImage,
  deleteMultipleImagesHandler,
} from '@/controllers/uploadController';
import * as uploadService from '@/services/uploadService';

jest.mock('@/services/uploadService', () => ({
  __esModule: true,
  uploadImage: jest.fn(),
  uploadMultipleImages: jest.fn(),
  deleteImageByUrl: jest.fn(),
  deleteMultipleImagesByUrl: jest.fn(),
}));

const mockedUploadService = uploadService as unknown as {
  uploadImage: jest.Mock;
  uploadMultipleImages: jest.Mock;
  deleteImageByUrl: jest.Mock;
  deleteMultipleImagesByUrl: jest.Mock;
};

// =============================================
// Helpers
// =============================================

function createResponse(): Response {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return res as unknown as Response;
}

function createNext(): NextFunction {
  return jest.fn() as unknown as NextFunction;
}

function createRequest(overrides: Partial<Request> = {}): Request {
  return {
    body: {},
    params: {},
    query: {},
    headers: {},
    file: undefined,
    files: undefined,
    ...overrides,
  } as unknown as Request;
}

// =============================================
// uploadSingleImage
// =============================================
describe('uploadSingleImage', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 400 when no file is provided', async () => {
    const req = createRequest({ file: undefined });
    const res = createResponse();
    const next = createNext();

    await uploadSingleImage(req, res, next);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(400);
    expect(res.json as unknown as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: expect.stringContaining('Không có file'),
      })
    );
  });

  it('uploads single image successfully with default folder', async () => {
    const fakeFile = { buffer: Buffer.from('test') } as Express.Multer.File;
    const req = createRequest({
      file: fakeFile,
      query: {},
    });
    const res = createResponse();
    const next = createNext();

    mockedUploadService.uploadImage.mockResolvedValue({
      url: 'https://res.cloudinary.com/xxx/image/upload/foodshare/posts/abc.jpg',
      publicId: 'foodshare/posts/abc',
    });

    await uploadSingleImage(req, res, next);

    expect(mockedUploadService.uploadImage).toHaveBeenCalledWith(
      fakeFile.buffer,
      'posts'
    );
    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(200);
    expect(res.json as unknown as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({ url: expect.any(String) }),
      })
    );
  });

  it('uploads single image with custom folder query', async () => {
    const fakeFile = { buffer: Buffer.from('avatar') } as Express.Multer.File;
    const req = createRequest({
      file: fakeFile,
      query: { folder: 'avatars' },
    });
    const res = createResponse();
    const next = createNext();

    mockedUploadService.uploadImage.mockResolvedValue({
      url: 'https://res.cloudinary.com/xxx/image/upload/foodshare/avatars/img.jpg',
      publicId: 'foodshare/avatars/img',
    });

    await uploadSingleImage(req, res, next);

    expect(mockedUploadService.uploadImage).toHaveBeenCalledWith(
      fakeFile.buffer,
      'avatars'
    );
    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(200);
  });

  it('calls next(error) when upload fails', async () => {
    const fakeFile = { buffer: Buffer.from('fail') } as Express.Multer.File;
    const req = createRequest({ file: fakeFile });
    const res = createResponse();
    const next = createNext();

    const uploadError = new Error('Cloudinary down');
    mockedUploadService.uploadImage.mockRejectedValue(uploadError);

    await uploadSingleImage(req, res, next);

    expect(next).toHaveBeenCalledWith(uploadError);
  });
});

// =============================================
// uploadMultipleImagesHandler
// =============================================
describe('uploadMultipleImagesHandler', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 400 when no files are provided', async () => {
    const req = createRequest({ files: undefined });
    const res = createResponse();
    const next = createNext();

    await uploadMultipleImagesHandler(req, res, next);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(400);
    expect(res.json as unknown as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({ success: false })
    );
  });

  it('returns 400 when files array is empty', async () => {
    const req = createRequest({ files: [] });
    const res = createResponse();
    const next = createNext();

    await uploadMultipleImagesHandler(req, res, next);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(400);
  });

  it('uploads multiple images successfully', async () => {
    const fakeFiles = [
      { buffer: Buffer.from('img1') },
      { buffer: Buffer.from('img2') },
    ] as Express.Multer.File[];
    const req = createRequest({
      files: fakeFiles,
      query: { folder: 'posts' },
    });
    const res = createResponse();
    const next = createNext();

    mockedUploadService.uploadMultipleImages.mockResolvedValue([
      {
        url: 'https://res.cloudinary.com/xxx/posts/1.jpg',
        publicId: 'foodshare/posts/1',
      },
      {
        url: 'https://res.cloudinary.com/xxx/posts/2.jpg',
        publicId: 'foodshare/posts/2',
      },
    ]);

    await uploadMultipleImagesHandler(req, res, next);

    expect(mockedUploadService.uploadMultipleImages).toHaveBeenCalledWith(
      [fakeFiles[0].buffer, fakeFiles[1].buffer],
      'posts'
    );
    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(200);
    expect(res.json as unknown as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.arrayContaining([
          expect.objectContaining({ url: expect.any(String) }),
        ]),
      })
    );
  });

  it('calls next(error) when upload fails', async () => {
    const fakeFiles = [{ buffer: Buffer.from('x') }] as Express.Multer.File[];
    const req = createRequest({ files: fakeFiles });
    const res = createResponse();
    const next = createNext();

    const err = new Error('upload failure');
    mockedUploadService.uploadMultipleImages.mockRejectedValue(err);

    await uploadMultipleImagesHandler(req, res, next);

    expect(next).toHaveBeenCalledWith(err);
  });
});

// =============================================
// deleteSingleImage
// =============================================
describe('deleteSingleImage', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 400 when url is missing', async () => {
    const req = createRequest({ body: {} });
    const res = createResponse();
    const next = createNext();

    await deleteSingleImage(req, res, next);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(400);
    expect(res.json as unknown as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({ success: false })
    );
  });

  it('deletes image successfully', async () => {
    const req = createRequest({
      body: {
        url: 'https://res.cloudinary.com/xxx/image/upload/foodshare/avatars/abc.jpg',
      },
    });
    const res = createResponse();
    const next = createNext();

    mockedUploadService.deleteImageByUrl.mockResolvedValue(undefined);

    await deleteSingleImage(req, res, next);

    expect(mockedUploadService.deleteImageByUrl).toHaveBeenCalledWith(
      'https://res.cloudinary.com/xxx/image/upload/foodshare/avatars/abc.jpg'
    );
    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(200);
    expect(res.json as unknown as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({ success: true })
    );
  });

  it('calls next(error) when delete fails', async () => {
    const req = createRequest({
      body: {
        url: 'https://res.cloudinary.com/xxx/image/upload/foodshare/posts/x.jpg',
      },
    });
    const res = createResponse();
    const next = createNext();

    const err = new Error('Cloudinary error');
    mockedUploadService.deleteImageByUrl.mockRejectedValue(err);

    await deleteSingleImage(req, res, next);

    expect(next).toHaveBeenCalledWith(err);
  });
});

// =============================================
// deleteMultipleImagesHandler
// =============================================
describe('deleteMultipleImagesHandler', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 400 when urls is missing', async () => {
    const req = createRequest({ body: {} });
    const res = createResponse();
    const next = createNext();

    await deleteMultipleImagesHandler(req, res, next);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(400);
  });

  it('returns 400 when urls is empty array', async () => {
    const req = createRequest({ body: { urls: [] } });
    const res = createResponse();
    const next = createNext();

    await deleteMultipleImagesHandler(req, res, next);

    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(400);
  });

  it('deletes multiple images successfully', async () => {
    const urls = [
      'https://res.cloudinary.com/xxx/image/upload/foodshare/posts/1.jpg',
      'https://res.cloudinary.com/xxx/image/upload/foodshare/posts/2.jpg',
    ];
    const req = createRequest({ body: { urls } });
    const res = createResponse();
    const next = createNext();

    mockedUploadService.deleteMultipleImagesByUrl.mockResolvedValue(undefined);

    await deleteMultipleImagesHandler(req, res, next);

    expect(mockedUploadService.deleteMultipleImagesByUrl).toHaveBeenCalledWith(
      urls
    );
    expect(res.status as unknown as jest.Mock).toHaveBeenCalledWith(200);
    expect(res.json as unknown as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({ success: true })
    );
  });

  it('calls next(error) when delete fails', async () => {
    const req = createRequest({
      body: {
        urls: [
          'https://res.cloudinary.com/xxx/image/upload/foodshare/posts/x.jpg',
        ],
      },
    });
    const res = createResponse();
    const next = createNext();

    const err = new Error('batch delete failed');
    mockedUploadService.deleteMultipleImagesByUrl.mockRejectedValue(err);

    await deleteMultipleImagesHandler(req, res, next);

    expect(next).toHaveBeenCalledWith(err);
  });
});

// =============================================
// extractPublicId (unit logic)
// =============================================
describe('extractPublicId', () => {
  // Import directly since it's a pure function
  const { extractPublicId } = jest.requireActual<
    typeof import('@/services/uploadService')
  >('@/services/uploadService');

  it('extracts publicId from standard Cloudinary URL', () => {
    const url =
      'https://res.cloudinary.com/demo/image/upload/v1234567890/foodshare/avatars/abc.jpg';
    expect(extractPublicId(url)).toBe('foodshare/avatars/abc');
  });

  it('extracts publicId without version prefix', () => {
    const url =
      'https://res.cloudinary.com/demo/image/upload/foodshare/posts/img123.png';
    expect(extractPublicId(url)).toBe('foodshare/posts/img123');
  });

  it('returns null for non-Cloudinary URL', () => {
    expect(extractPublicId('https://example.com/img.jpg')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(extractPublicId('')).toBeNull();
  });

  it('handles URL with nested folders', () => {
    const url =
      'https://res.cloudinary.com/demo/image/upload/v999/foodshare/kyc/user123/doc.webp';
    expect(extractPublicId(url)).toBe('foodshare/kyc/user123/doc');
  });
});

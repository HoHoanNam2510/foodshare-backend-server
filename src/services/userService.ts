import User, { IUser } from '@/models/User';
import { hashPassword } from '@/utils/auth';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

type SortOrder = 'asc' | 'desc';

type UserListQuery = {
  search?: string;
  role?: IUser['role'];
  status?: IUser['status'];
  authProvider?: IUser['authProvider'];
  kycStatus?: IUser['kycStatus'];
  isProfileCompleted?: boolean;
  page?: number;
  limit?: number;
  sortBy?:
    | 'createdAt'
    | 'updatedAt'
    | 'fullName'
    | 'email'
    | 'greenPoints'
    | 'averageRating';
  sortOrder?: SortOrder;
};

type CreateUserInput = {
  email: string;
  password?: string;
  googleId?: string;
  authProvider?: IUser['authProvider'];
  role?: IUser['role'];
  fullName: string;
  phoneNumber?: string;
  avatar?: string;
  defaultAddress?: string;
  location?: IUser['location'];
  kycStatus?: IUser['kycStatus'];
  kycDocuments?: string[];
  storeInfo?: IUser['storeInfo'];
  greenPoints?: number;
  averageRating?: number;
  status?: IUser['status'];
  isProfileCompleted?: boolean;
};

type UpdateUserInput = Partial<CreateUserInput>;

export class UserServiceError extends Error {
  public statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
  }
}

function toSafeUser(user: IUser): Record<string, unknown> {
  const userData = user.toObject();
  delete userData.password;
  return userData;
}

function buildUserFilter(query: UserListQuery): Record<string, unknown> {
  const filters: Record<string, unknown> = {};

  if (query.role) {
    filters.role = query.role;
  }

  if (query.status) {
    filters.status = query.status;
  }

  if (query.authProvider) {
    filters.authProvider = query.authProvider;
  }

  if (query.kycStatus) {
    filters.kycStatus = query.kycStatus;
  }

  if (typeof query.isProfileCompleted === 'boolean') {
    filters.isProfileCompleted = query.isProfileCompleted;
  }

  if (query.search?.trim()) {
    const regex = new RegExp(query.search.trim(), 'i');
    filters.$or = [
      { fullName: regex },
      { email: regex },
      { phoneNumber: regex },
    ];
  }

  return filters;
}

function buildSort(query: UserListQuery): Record<string, 1 | -1> {
  const sortBy = query.sortBy || 'createdAt';
  const sortOrder: SortOrder = query.sortOrder === 'asc' ? 'asc' : 'desc';

  return { [sortBy]: sortOrder === 'asc' ? 1 : -1 };
}

export async function createUser(
  payload: CreateUserInput
): Promise<Record<string, unknown>> {
  const {
    email,
    password,
    googleId,
    authProvider,
    role,
    fullName,
    phoneNumber,
    avatar,
    defaultAddress,
    location,
    kycStatus,
    kycDocuments,
    storeInfo,
    greenPoints,
    averageRating,
    status,
    isProfileCompleted,
  } = payload;

  const normalizedEmail = email.toLowerCase();

  const duplicatedUser = await User.findOne({
    $or: [
      { email: normalizedEmail },
      ...(phoneNumber ? [{ phoneNumber }] : []),
      ...(googleId ? [{ googleId }] : []),
    ],
  });

  if (duplicatedUser) {
    throw new UserServiceError('Email/Số điện thoại/Google ID đã tồn tại', 409);
  }

  const hashedPassword =
    typeof password === 'string' && password.trim()
      ? await hashPassword(password)
      : undefined;

  const createdUser = await User.create({
    email: normalizedEmail,
    password: hashedPassword,
    googleId,
    authProvider: authProvider || (googleId ? 'GOOGLE' : 'LOCAL'),
    role,
    fullName,
    phoneNumber,
    avatar,
    defaultAddress,
    location,
    kycStatus,
    kycDocuments,
    storeInfo,
    greenPoints,
    averageRating,
    status,
    isProfileCompleted,
  });

  return toSafeUser(createdUser);
}

export async function getUsers(query: UserListQuery): Promise<{
  users: Record<string, unknown>[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}> {
  const pageRaw = query.page;
  const limitRaw = query.limit;

  const page =
    typeof pageRaw === 'number' && pageRaw > 0 ? pageRaw : DEFAULT_PAGE;
  const limit =
    typeof limitRaw === 'number' && limitRaw > 0
      ? Math.min(limitRaw, MAX_LIMIT)
      : DEFAULT_LIMIT;

  const filters = buildUserFilter(query);
  const sort = buildSort(query);

  const [users, total] = await Promise.all([
    User.find(filters)
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit),
    User.countDocuments(filters),
  ]);

  return {
    users: users.map((user) => toSafeUser(user)),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getUserById(
  id: string
): Promise<Record<string, unknown>> {
  const user = await User.findById(id);

  if (!user) {
    throw new UserServiceError('Không tìm thấy người dùng', 404);
  }

  return toSafeUser(user);
}

export async function updateUser(
  id: string,
  payload: UpdateUserInput
): Promise<Record<string, unknown>> {
  const {
    email,
    password,
    phoneNumber,
    googleId,
    authProvider,
    role,
    fullName,
    avatar,
    defaultAddress,
    location,
    kycStatus,
    kycDocuments,
    storeInfo,
    greenPoints,
    averageRating,
    status,
    isProfileCompleted,
  } = payload;

  const user = await User.findById(id).select('+password');

  if (!user) {
    throw new UserServiceError('Không tìm thấy người dùng', 404);
  }

  if (typeof email === 'string' && email.toLowerCase() !== user.email) {
    const emailExists = await User.findOne({ email: email.toLowerCase() });

    if (emailExists) {
      throw new UserServiceError('Email đã được sử dụng', 409);
    }
  }

  if (
    typeof phoneNumber === 'string' &&
    phoneNumber &&
    phoneNumber !== user.phoneNumber
  ) {
    const phoneExists = await User.findOne({ phoneNumber });

    if (phoneExists) {
      throw new UserServiceError('Số điện thoại đã được sử dụng', 409);
    }
  }

  if (typeof googleId === 'string' && googleId && googleId !== user.googleId) {
    const googleIdExists = await User.findOne({ googleId });

    if (googleIdExists) {
      throw new UserServiceError('Google ID đã được sử dụng', 409);
    }
  }

  if (typeof email === 'string') {
    user.email = email.toLowerCase();
  }

  if (typeof password === 'string' && password.trim()) {
    user.password = await hashPassword(password);
  }

  if (typeof phoneNumber === 'string') {
    user.phoneNumber = phoneNumber;
  }

  if (typeof googleId === 'string') {
    user.googleId = googleId;
  }

  if (authProvider) {
    user.authProvider = authProvider;
  }

  if (role) {
    user.role = role;
  }

  if (typeof fullName === 'string') {
    user.fullName = fullName;
  }

  if (typeof avatar === 'string') {
    user.avatar = avatar;
  }

  if (typeof defaultAddress === 'string') {
    user.defaultAddress = defaultAddress;
  }

  if (typeof location === 'object') {
    user.location = location;
  }

  if (kycStatus) {
    user.kycStatus = kycStatus;
  }

  if (Array.isArray(kycDocuments)) {
    user.kycDocuments = kycDocuments;
  }

  if (typeof storeInfo === 'object') {
    user.storeInfo = storeInfo;
  }

  if (typeof greenPoints === 'number') {
    user.greenPoints = greenPoints;
  }

  if (typeof averageRating === 'number') {
    user.averageRating = averageRating;
  }

  if (status) {
    user.status = status;
  }

  if (typeof isProfileCompleted === 'boolean') {
    user.isProfileCompleted = isProfileCompleted;
  }

  const updatedUser = await user.save();

  return toSafeUser(updatedUser);
}

export async function reviewKyc(
  id: string,
  action: 'APPROVE' | 'REJECT',
  rejectionReason?: string
): Promise<Record<string, unknown>> {
  const user = await User.findById(id);

  if (!user) {
    throw new UserServiceError('Không tìm thấy người dùng', 404);
  }

  // Chỉ xét duyệt user đang PENDING và đã nộp KYC documents
  if (user.kycDocuments.length === 0) {
    throw new UserServiceError(
      'Người dùng chưa nộp tài liệu KYC',
      400
    );
  }

  if (user.role === 'STORE' && user.kycStatus === 'VERIFIED') {
    throw new UserServiceError(
      'Người dùng đã được duyệt trước đó',
      409
    );
  }

  if (action === 'APPROVE') {
    user.kycStatus = 'VERIFIED';
    user.role = 'STORE';
  } else {
    user.kycStatus = 'REJECTED';
    // Không xóa storeInfo và kycDocuments — giữ lại để user có thể xem lại và nộp lại
  }

  const updatedUser = await user.save();
  return toSafeUser(updatedUser);
}

export async function deleteUser(id: string): Promise<Record<string, unknown>> {
  const deletedUser = await User.findByIdAndDelete(id);

  if (!deletedUser) {
    throw new UserServiceError('Không tìm thấy người dùng', 404);
  }

  return toSafeUser(deletedUser);
}

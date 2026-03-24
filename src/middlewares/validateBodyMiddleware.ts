import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';

export function validateBody<TBody>(schema: ZodSchema<TBody>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const parseResult = schema.safeParse(req.body);

    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        message: 'Dữ liệu đầu vào không hợp lệ',
        errors: parseResult.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
      return;
    }

    req.body = parseResult.data as Request['body'];
    next();
  };
}

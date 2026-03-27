import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';

export function validateParams(schema: ZodSchema<unknown>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const parseResult = schema.safeParse(req.params);

    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        message: 'Tham số đường dẫn không hợp lệ',
        errors: parseResult.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
      return;
    }

    Object.assign(req.params, parseResult.data as Request['params']);
    next();
  };
}

export function validateQuery(schema: ZodSchema<unknown>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const parseResult = schema.safeParse(req.query);

    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        message: 'Query parameters không hợp lệ',
        errors: parseResult.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
      return;
    }

    Object.assign(req.query, parseResult.data as Request['query']);
    next();
  };
}

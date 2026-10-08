import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { isProduction } from '../config/env';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public errors?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function notFoundHandler(req: Request, _res: Response, next: NextFunction) {
  next(new AppError(404, `Route not found: ${req.method} ${req.originalUrl}`));
}

interface PgError {
  code?: string;
  detail?: string;
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    const errors: Record<string, string[]> = {};
    for (const issue of err.issues) {
      const key = issue.path.join('.') || '_root';
      (errors[key] ??= []).push(issue.message);
    }
    return res.status(400).json({ success: false, message: 'Validation failed', errors });
  }

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      ...(err.errors !== undefined && { errors: err.errors }),
    });
  }

  const pgErr = err as PgError;
  if (pgErr?.code === '23505') {
    return res.status(409).json({ success: false, message: 'Duplicate record', errors: pgErr.detail });
  }
  if (pgErr?.code === '23503') {
    return res.status(400).json({ success: false, message: 'Referenced record does not exist', errors: pgErr.detail });
  }

  console.error(err);
  return res.status(500).json({
    success: false,
    message: 'Internal server error',
    ...(!isProduction && err instanceof Error && { errors: err.message }),
  });
}

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
  next(new AppError(404, isProduction ? 'Route not found' : `Route not found: ${req.method} ${req.originalUrl}`));
}

interface PgError {
  code?: string;
  detail?: string;
  constraint?: string;
}

/** Errors raised by body-parser carry an HTTP status and a `type` such as 'entity.parse.failed'. */
interface HttpError {
  status?: number;
  type?: string;
}

/** Details (constraint names, column values, SQL text) are only echoed back outside production. */
const devOnly = (details: unknown) => (isProduction || details === undefined ? {} : { errors: details });

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
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

  const httpErr = err as HttpError;
  if (httpErr?.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, message: 'Malformed request body' });
  }
  if (httpErr?.type === 'entity.too.large') {
    return res.status(413).json({ success: false, message: 'Request body is too large' });
  }

  const pgErr = err as PgError;
  if (pgErr?.code === '23505') {
    return res.status(409).json({ success: false, message: 'Duplicate record', ...devOnly(pgErr.detail) });
  }
  if (pgErr?.code === '23503') {
    return res.status(400).json({ success: false, message: 'Referenced record does not exist', ...devOnly(pgErr.detail) });
  }
  if (pgErr?.code === '23514') {
    return res.status(400).json({
      success: false,
      message: 'One or more values are not allowed (e.g. amount paid cannot exceed the total)',
      ...devOnly(pgErr.constraint),
    });
  }

  console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`, err);
  return res.status(500).json({
    success: false,
    message: 'Internal server error',
    ...devOnly(err instanceof Error ? err.message : undefined),
  });
}

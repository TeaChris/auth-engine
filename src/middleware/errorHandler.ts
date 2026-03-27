import { Request, Response, NextFunction } from 'express';
import { AppError } from '@/core/errors/AppError';
import { logger } from '@/infrastructure/logger/winston';
import { env } from '@/config/env';

export const globalErrorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  let statusCode = 500;
  let message = 'Internal Server Error';

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
  }

  // Log all non-operational and 500+ errors
  if (!(err instanceof AppError) || err.statusCode >= 500) {
    logger.error(`[${req.method}] ${req.url} >> ${err.message}`, { stack: err.stack });
  } else {
    logger.warn(`[${req.method}] ${req.url} >> ${err.message}`);
  }

  res.status(statusCode).json({
    success: false,
    error: {
      message,
      ...(env.NODE_ENV === 'development' && { stack: err.stack }),
    },
  });
};

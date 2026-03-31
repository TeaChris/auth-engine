import { Request, Response, NextFunction } from 'express'
import { Prisma } from '@prisma/client'
import { ZodError } from 'zod'
import { logger } from '@/infrastructure'
import { AppError } from '@/utils/AppError'

const isProd = process.env['NODE_ENV'] === 'production'

/**
 * Global error-handling middleware.
 * - Never leaks stack traces in production
 * - Handles AppError, ZodError, Prisma errors uniformly
 * - Returns a consistent { success, statusCode, message, errors? } envelope
 */
export const globalErrorHandler = (
      err: Error,
      req: Request,
      res: Response,
      _next: NextFunction,
): void => {
      const meta = { url: req.url, method: req.method }

      // ─── Zod Validation Errors ─────────────────────────────────────────────────
      if (err instanceof ZodError) {
            res.status(422).json({
                  success: false,
                  statusCode: 422,
                  message: 'Validation failed',
                  errors: err.errors.map((e) => ({
                        field: e.path.join('.'),
                        message: e.message,
                  })),
            })
            return
      }

      // ─── Known Operational Errors (AppError) ───────────────────────────────────
      if (err instanceof AppError && err.isOperational) {
            logger.warn({ ...meta, statusCode: err.statusCode }, err.message)
            res.status(err.statusCode).json({
                  success: false,
                  statusCode: err.statusCode,
                  message: err.message,
                  errors: err.details ?? undefined,
            })
            return
      }

      // ─── Prisma Known Request Errors ──────────────────────────────────────────
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
            if (err.code === 'P2002') {
                  res.status(409).json({
                        success: false,
                        statusCode: 409,
                        message: 'Resource already exists',
                  })
                  return
            }
            if (err.code === 'P2025') {
                  res.status(404).json({
                        success: false,
                        statusCode: 404,
                        message: 'Resource not found',
                  })
                  return
            }
      }

      // ─── Unknown / Programmer Errors ──────────────────────────────────────────
      logger.error({ ...meta, err }, 'Unhandled server error')
      res.status(500).json({
            success: false,
            statusCode: 500,
            message: 'An unexpected error occurred',
            ...(!isProd && { stack: err.stack }),
      })
}

/**
 * Catches requests to undefined routes.
 */
export const notFoundHandler = (req: Request, res: Response): void => {
      res.status(404).json({
            success: false,
            statusCode: 404,
            message: `Cannot ${req.method} ${req.url}`,
      })
}

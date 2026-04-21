import type { Request, Response, NextFunction } from 'express'
import { jwtVerify } from 'jose'
import { env } from '@/config'
import { AppError } from '@/utils/AppError'
import { asyncHandler } from '@/utils/asyncHandler'

/**
 * Extend Express Request type to include populated user context.
 */
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string
        role: string
      }
    }
  }
}

const ACCESS_SECRET = new TextEncoder().encode(env.JWT_ACCESS_SECRET)

/**
 * authenticate — JWT Protection Middleware.
 * Extracts the Bearer token from the Authorization header, verifies it,
 * and populates req.user with the payload.
 *
 * Throws 401 on missing, invalid, or expired tokens.
 */
export const authenticate = asyncHandler(
  async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const authHeader = req.headers.authorization

    if (!authHeader?.startsWith('Bearer ')) {
      throw new AppError('Authentication required. Please log in.', 401)
    }

    const token = authHeader.split(' ')[1]
    if (!token) {
      throw new AppError('Authentication token not provided.', 401)
    }

    try {
      const { payload } = await jwtVerify(token, ACCESS_SECRET, {
        algorithms: ['HS256'], // Explicitly restrict to HS256 to prevent "alg: none" or asymmetric key confusion
      })

      // Type-safe extraction from JWTPayload
      req.user = {
        id: payload.sub as string,
        role: payload['role'] as string,
      }

      next()
    } catch (err: unknown) {
      // jwtVerify throws for expired, malformed, or invalidly signed tokens
      throw new AppError('Invalid or expired authentication token. Please log in again.', 401)
    }
  },
)

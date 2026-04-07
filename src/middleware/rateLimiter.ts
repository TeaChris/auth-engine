import { rateLimit } from 'express-rate-limit'
import { env } from '@/config'

/** General API rate limiter — applied to all routes */
export const generalRateLimiter = rateLimit({
      windowMs: env.RATE_LIMIT_WINDOW_MS,
      max: env.RATE_LIMIT_MAX,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: {
            success: false,
            message: 'Too many requests from this IP. Please try again later.',
      },
      skip: (req) => req.path === '/health', // health checks bypass rate limiting
      keyGenerator: (req) => req.ip ?? req.socket.remoteAddress ?? 'unknown',
})

/** Strict auth rate limiter — applied only to auth endpoints */
export const authRateLimiter = rateLimit({
      windowMs: 15 * 60 * 1000, // always 15 minutes, regardless of global setting
      max: env.AUTH_RATE_LIMIT_MAX,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: {
            success: false,
            message: 'Too many authentication attempts. Please try again in 15 minutes.',
      },
      keyGenerator: (req) => req.ip ?? req.socket.remoteAddress ?? 'unknown',
})

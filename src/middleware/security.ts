import type { Request, Response, NextFunction } from 'express'
import { doubleCsrf } from 'csrf-csrf'
import createDOMPurify from 'dompurify'
import { JSDOM } from 'jsdom'
import { env } from '@/config'
import { logger } from '@/infrastructure'

// ─── CSRF Protection ─────────────────────────────────────────────────────────
// Double-CSRF pattern (cookie + header).
// Uses a DEDICATED CSRF_SECRET — never share this with JWT secrets.
export const {
  invalidCsrfTokenError,
  generateCsrfToken,
  doubleCsrfProtection,
} = doubleCsrf({
  getSecret: () => env.CSRF_SECRET,
  getSessionIdentifier: (req) => req.ip ?? 'unknown',
  cookieName: 'x-csrf-token',
  cookieOptions: {
    httpOnly: true,
    sameSite: 'strict',
    secure: env.NODE_ENV === 'production',
  },
  size: 64,
  ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],
})

// ─── Global Input Sanitization ───────────────────────────────────────────────
// JSDOM window is typed; DOMPurify accepts `Window & typeof globalThis`.
const { window: jsdomWindow } = new JSDOM('')
const DOMPurify = createDOMPurify(jsdomWindow as unknown as Window & typeof globalThis)

type SanitizablePrimitive = string | number | boolean | null
type SanitizableValue = SanitizablePrimitive | SanitizableObject | SanitizableValue[]
interface SanitizableObject {
  [key: string]: SanitizableValue
}

/**
 * Recursively sanitizes strings in a plain object using DOMPurify.
 * Strips any potential XSS payloads (<script>, event handlers, etc.).
 * Only operates on plain objects and strings — ignores arrays and primitives.
 */
const sanitizeObject = (obj: SanitizableObject): SanitizableObject => {
  const result: SanitizableObject = {}
  for (const key of Object.keys(obj)) {
    const value = obj[key]
    if (typeof value === 'string') {
      result[key] = DOMPurify.sanitize(value)
    } else if (Array.isArray(value)) {
      result[key] = value
    } else if (value !== null && typeof value === 'object') {
      result[key] = sanitizeObject(value as SanitizableObject)
    } else {
      // Object.keys() only yields own enumerable keys, so value is always defined
      result[key] = value as SanitizableValue
    }
  }
  return result
}

/**
 * Express middleware that performs global input sanitization on req.body and req.query.
 * Runs AFTER body parsing (so req.body is populated) and BEFORE Zod validation.
 */
export const sanitizationMiddleware = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  try {
    if (req.body && typeof req.body === 'object') {
      req.body = sanitizeObject(req.body as SanitizableObject)
    }
    if (req.query && typeof req.query === 'object') {
      req.query = sanitizeObject(req.query as unknown as SanitizableObject) as typeof req.query
    }
    next()
  } catch (error) {
    logger.error({ error }, 'Failed to sanitize request input')
    next(error)
  }
}

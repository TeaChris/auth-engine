import { Request, Response, NextFunction } from 'express';
import { doubleCsrf } from 'csrf-csrf';
import createDOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';
import { env } from '@/config';
import { logger } from '@/infrastructure';

// ─── CSRF Protection ───────────────────────────────────────────────────────
// Double-CSRF pattern (cookie + header)
export const {
  invalidCsrfTokenError,
  generateToken,
  doubleCsrfProtection,
} = doubleCsrf({
  getSecret: () => env.JWT_ACCESS_SECRET, // Use a secret from env
  cookieName: 'x-csrf-token',
  cookieOptions: {
    httpOnly: true,
    sameSite: 'strict',
    secure: env.NODE_ENV === 'production',
  },
  size: 64,
  ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],
});

// ─── Global Input Sanitization ─────────────────────────────────────────────
const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window as unknown as Window);

/**
 * Recursively sanitizes strings in an object using DOMPurify.
 * This strips any potential XSS payloads (<script>, event handlers, etc.)
 */
const sanitizeObject = (obj: any): any => {
  if (typeof obj !== 'object' || obj === null) return obj;

  for (const key in obj) {
    if (typeof obj[key] === 'string') {
      obj[key] = DOMPurify.sanitize(obj[key]);
    } else if (typeof obj[key] === 'object') {
      obj[key] = sanitizeObject(obj[key]);
    }
  }
  return obj;
};

/**
 * Middleware that performs global input sanitization on req.body and req.query.
 * This runs BEFORE Zod validation to ensure the data is "clean" but still matches schemas.
 */
export const sanitizationMiddleware = (req: Request, _res: Response, next: NextFunction) => {
  try {
    if (req.body) req.body = sanitizeObject(req.body);
    if (req.query) req.query = sanitizeObject(req.query);
    next();
  } catch (error) {
    logger.error('❌ Failed to sanitize request input', error);
    next(error);
  }
};

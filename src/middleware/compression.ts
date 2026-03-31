import compression from 'compression';
import { Request, Response } from 'express';

/**
 * Gzip compression middleware.
 * - Skips requests that send `X-No-Compression` header (useful for SSE/streaming)
 * - Only compresses responses > 1 KB to avoid overhead on tiny payloads
 * - Level 6 balances speed vs ratio (default is 6, but explicit is self-documenting)
 */
export const compressionMiddleware = compression({
  filter: (req: Request, res: Response): boolean => {
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  },
  level: 6,
  threshold: 1024, // bytes — don't compress responses < 1 KB
});

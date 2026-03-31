import { Router, Request, Response } from 'express';
import { container } from '@/container';
import { asyncHandler } from '@/utils/asyncHandler';
import { validate } from '@/middleware/validate';
import { authRateLimiter } from '@/middleware/rateLimiter';
import { env } from '@/config/env';
import { RegisterSchema, LoginSchema } from './auth.schema';
import type { AuthService } from './auth.service';

const router = Router();

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
  path: '/api/v1/auth',
};

// ─── POST /api/v1/auth/register ────────────────────────────────────────────────
router.post(
  '/register',
  authRateLimiter,
  validate({ body: RegisterSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const authService = container.resolve<AuthService>('authService');
    const data = await authService.register(req.body);
    res.status(201).json({ success: true, data });
  }),
);

// ─── POST /api/v1/auth/login ───────────────────────────────────────────────────
router.post(
  '/login',
  authRateLimiter,
  validate({ body: LoginSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const authService = container.resolve<AuthService>('authService');
    const { accessToken, refreshToken, user } = await authService.login(req.body);

    // Refresh token delivered via httpOnly cookie — never exposed to JS
    res.cookie('refreshToken', refreshToken, COOKIE_OPTIONS);
    res.status(200).json({ success: true, data: { accessToken, user } });
  }),
);

// ─── POST /api/v1/auth/refresh ─────────────────────────────────────────────────
router.post(
  '/refresh',
  asyncHandler(async (req: Request, res: Response) => {
    const authService = container.resolve<AuthService>('authService');
    // Accept token from cookie (browser) or body (mobile/API clients)
    const refreshToken: string | undefined =
      req.cookies?.['refreshToken'] ?? req.body?.refreshToken;

    if (!refreshToken) {
      res.status(401).json({ success: false, message: 'Refresh token not provided' });
      return;
    }

    const tokens = await authService.refreshTokens(refreshToken);
    res.cookie('refreshToken', tokens.refreshToken, COOKIE_OPTIONS);
    res.status(200).json({ success: true, data: { accessToken: tokens.accessToken } });
  }),
);

// ─── POST /api/v1/auth/logout ──────────────────────────────────────────────────
router.post(
  '/logout',
  asyncHandler(async (req: Request, res: Response) => {
    const authService = container.resolve<AuthService>('authService');
    const refreshToken: string | undefined = req.cookies?.['refreshToken'];

    if (refreshToken) {
      await authService.logout(refreshToken);
    }

    res.clearCookie('refreshToken', { path: '/api/v1/auth' });
    res.status(200).json({ success: true, message: 'Logged out successfully' });
  }),
);

export { router as authRouter };

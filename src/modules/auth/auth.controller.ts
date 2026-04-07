import { Router, type Request, type Response } from 'express'

import { env } from '@/config'
import { asyncHandler } from '@/utils'
import { container } from '@/container'
import type { AuthService } from './auth.service'
import { authRateLimiter, validate } from '@/middleware'
import {
  LoginSchema,
  RegisterSchema,
  ForgotPasswordSchema,
  ResetPasswordSchema,
  VerifyEmailSchema,
} from './auth.schema'

const router = Router()

// ─── Shared Cookie Configuration ─────────────────────────────────────────────
// Centralised here so the same options are used for set AND clear operations.
const COOKIE_NAME = 'refreshToken'
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  // maxAge matches the 7-day REFRESH_TTL_SEC in auth.service.ts
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
  path: '/api/v1/auth',
}

/** Extracts IP + User-Agent request context for the audit trail. */
const getRequestContext = (req: Request) => ({
  ip: req.ip ?? req.socket.remoteAddress ?? 'unknown',
  userAgent: req.headers['user-agent'],
})

// ─── POST /api/v1/auth/register ──────────────────────────────────────────────
router.post(
  '/register',
  authRateLimiter,
  validate({ body: RegisterSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const authService = container.resolve<AuthService>('authService')
    const data = await authService.register(req.body, getRequestContext(req))
    res.status(201).json({ success: true, data })
  }),
)

// ─── POST /api/v1/auth/login ─────────────────────────────────────────────────
router.post(
  '/login',
  authRateLimiter,
  validate({ body: LoginSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const authService = container.resolve<AuthService>('authService')
    const { accessToken, refreshToken, user } = await authService.login(
      req.body,
      getRequestContext(req),
    )

    // Refresh token delivered via httpOnly cookie — never exposed to JS
    res.cookie(COOKIE_NAME, refreshToken, COOKIE_OPTIONS)
    res.status(200).json({ success: true, data: { accessToken, user } })
  }),
)

// ─── POST /api/v1/auth/refresh ───────────────────────────────────────────────
router.post(
  '/refresh',
  asyncHandler(async (req: Request, res: Response) => {
    const authService = container.resolve<AuthService>('authService')
    // Accept token from cookie (browser) or body (mobile/API clients)
    const refreshToken: string | undefined =
      req.cookies?.[COOKIE_NAME] ?? req.body?.refreshToken

    if (!refreshToken) {
      res.status(401).json({
        success: false,
        message: 'Refresh token not provided',
      })
      return
    }

    const tokens = await authService.refreshTokens(refreshToken, getRequestContext(req))
    res.cookie(COOKIE_NAME, tokens.refreshToken, COOKIE_OPTIONS)
    res.status(200).json({
      success: true,
      data: { accessToken: tokens.accessToken },
    })
  }),
)

// ─── POST /api/v1/auth/logout ────────────────────────────────────────────────
router.post(
  '/logout',
  asyncHandler(async (req: Request, res: Response) => {
    const authService = container.resolve<AuthService>('authService')
    const refreshToken: string | undefined = req.cookies?.[COOKIE_NAME]

    if (refreshToken) {
      await authService.logout(refreshToken, getRequestContext(req))
    }

    // Clear cookie with the SAME options used to set it (required by some browsers)
    res.clearCookie(COOKIE_NAME, {
      httpOnly: COOKIE_OPTIONS.httpOnly,
      secure: COOKIE_OPTIONS.secure,
      sameSite: COOKIE_OPTIONS.sameSite,
      path: COOKIE_OPTIONS.path,
    })
    res.status(200).json({
      success: true,
      message: 'Logged out successfully',
    })
  }),
)

// ─── GET /api/v1/auth/me ─────────────────────────────────────────────────────
// Requires a valid access token (protect with authenticate middleware in production)
router.get(
  '/me',
  asyncHandler(async (req: Request, res: Response) => {
    const authService = container.resolve<AuthService>('authService')
    // NOTE: In a full implementation, req.user.id would be set by an
    // authenticate middleware (JWT guard). This stub reads from query for demo.
    const userId = req.query['userId'] as string | undefined
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' })
      return
    }
    const user = await authService.getMe(userId)
    res.status(200).json({ success: true, data: { user } })
  }),
)

// ─── POST /api/v1/auth/forgot-password ───────────────────────────────────────
router.post(
  '/forgot-password',
  authRateLimiter,
  validate({ body: ForgotPasswordSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const authService = container.resolve<AuthService>('authService')
    // Always return 200 — prevents user enumeration attacks
    await authService.forgotPassword(req.body, getRequestContext(req))
    res.status(200).json({
      success: true,
      message: 'If an account with that email exists, a password reset link has been sent.',
    })
  }),
)

// ─── POST /api/v1/auth/reset-password ────────────────────────────────────────
router.post(
  '/reset-password',
  validate({ body: ResetPasswordSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const authService = container.resolve<AuthService>('authService')
    await authService.resetPassword(req.body, getRequestContext(req))
    res.status(200).json({
      success: true,
      message: 'Password reset successfully. Please log in with your new password.',
    })
  }),
)

// ─── GET /api/v1/auth/verify-email/:token ─────────────────────────────────────
router.get(
  '/verify-email/:token',
  validate({ params: VerifyEmailSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const authService = container.resolve<AuthService>('authService')
    await authService.verifyEmail(
      { token: req.params['token']! },
      getRequestContext(req),
    )
    res.status(200).json({
      success: true,
      message: 'Email verified successfully.',
    })
  }),
)

export { router as authRouter }

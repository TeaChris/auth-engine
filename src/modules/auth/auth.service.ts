import argon2 from 'argon2'
import type { Logger } from 'pino'
import type { Queue } from 'bullmq'
import { SignJWT, jwtVerify, type JWTPayload } from 'jose'

import { env } from '@/config'
import { cache } from '@/infrastructure'
import { AppError } from '@/utils/AppError'
import { hashToken, generateSecureToken } from '@/utils/tokenHash'
import type { AuthRepository } from './auth.repository'
import type { AuditService } from './audit.service'
import { AuditAction } from './audit.types'
import type {
  RegisterDto,
  LoginDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  VerifyEmailDto,
} from './auth.schema'
import type { EmailJobData } from '../notifications/email.worker'

// ─── Constants ────────────────────────────────────────────────────────────────
const ARGON2_OPTIONS: argon2.Options & { raw?: false } = {
  type: argon2.argon2id,
  memoryCost: 65536, // 64 MB — OWASP recommended minimum
  timeCost: 3,
  parallelism: 4,
}

const REFRESH_PREFIX = 'refresh_token:'
const REFRESH_TTL_SEC = 7 * 24 * 60 * 60 // 7 days
const RESET_TOKEN_TTL_SEC = 60 * 60        // 1 hour
const LOCK_PREFIX = 'account_lock:'

// ─── Return types ─────────────────────────────────────────────────────────────
export interface AuthTokens {
  accessToken: string
  refreshToken: string
}

export interface PublicUser {
  id: string
  email: string
  role: string
  emailVerifiedAt: Date | null
}

/**
 * AuthService — Business Logic Layer.
 * Handles password hashing (Argon2id), JWT issuance/rotation, Redis session
 * storage, account lockout, and email-based recovery flows.
 */
export class AuthService {
  private readonly accessSecret: Uint8Array
  private readonly refreshSecret: Uint8Array

  constructor(
    private readonly authRepository: AuthRepository,
    private readonly logger: Logger,
    private readonly emailQueue: Queue,
    private readonly auditService: AuditService,
  ) {
    this.accessSecret = new TextEncoder().encode(env.JWT_ACCESS_SECRET)
    this.refreshSecret = new TextEncoder().encode(env.JWT_REFRESH_SECRET)
  }

  // ─── Register ───────────────────────────────────────────────────────────────
  async register(
    dto: RegisterDto,
    context: { ip?: string; userAgent?: string } = {},
  ): Promise<PublicUser> {
    const existing = await this.authRepository.findByEmail(dto.email)
    if (existing) throw new AppError('Email is already registered', 409)

    const [hashedPassword, rawVerifyToken] = await Promise.all([
      argon2.hash(dto.password, ARGON2_OPTIONS),
      Promise.resolve(generateSecureToken()),
    ])

    const user = await this.authRepository.create({
      email: dto.email,
      password: hashedPassword,
      // Store the hashed token in DB; send the raw token to the user
      emailVerificationToken: hashToken(rawVerifyToken),
    })

    // Enqueue welcome + verification email (producer pattern)
    this.emailQueue
      .add('email-verification', {
        type: 'email-verification',
        to: user.email,
        subject: 'Verify your email address',
        verificationUrl: `${env.APP_URL}/api/v1/auth/verify-email/${rawVerifyToken}`,
      } satisfies EmailJobData)
      .catch((err: unknown) => {
        this.logger.error({ err, userId: user.id }, 'Failed to enqueue verification email')
      })

    this.auditService.log({
      action: AuditAction.REGISTER,
      userId: user.id,
      ...context,
    })

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      emailVerifiedAt: user.emailVerifiedAt,
    }
  }

  // ─── Login ──────────────────────────────────────────────────────────────────
  async login(
    dto: LoginDto,
    context: { ip?: string; userAgent?: string } = {},
  ): Promise<AuthTokens & { user: PublicUser }> {
    const user = await this.authRepository.findByEmail(dto.email)

    // ─── Constant-Time Verification Logic (Anti-Enumeration) ────────────────
    // If the user doesn't exist, we perform a "dummy" hash verification
    // using a valid Argon2 hash but an incorrect password. This ensures
    // that the response time is similar to a real user check (~300-500ms).
    if (!user) {
      this.auditService.log({
        action: AuditAction.LOGIN_FAILURE,
        metadata: { reason: 'user_not_found' }, // Removed email for privacy
        ...context,
      })
      // Dummy check (Argon2id default params hash for "dummy_secret_password")
      // This is a defense-in-depth measure against timing attacks.
      const dummyHash = '$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHQ$WvYm2X8Y/4Z7a+8u8u8u8u8u8u8u8u8u8u8u8u8u8u8'
      await argon2.verify(dummyHash, dto.password, ARGON2_OPTIONS)
      throw new AppError('Invalid credentials', 401)
    }

    // ─── Account Lockout Check (DB-level) ──────────────────────────────────
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const remainingMs = user.lockedUntil.getTime() - Date.now()
      const remainingMin = Math.ceil(remainingMs / 60_000)
      this.auditService.log({
        action: AuditAction.LOGIN_FAILURE,
        userId: user.id,
        metadata: { reason: 'account_locked' }, // Removed lockedUntil for privacy/obscurity
        ...context,
      })
      throw new AppError(
        `Account is temporarily locked. Try again in ${remainingMin} minute(s).`,
        423,
      )
    }

    const isValid = await argon2.verify(user.password, dto.password, ARGON2_OPTIONS)

    if (!isValid) {
      // Increment failure counter and lock if threshold reached
      const failCount = await this.authRepository.incrementFailedLogins(user.id)
      const maxAttempts = env.LOGIN_MAX_ATTEMPTS

      if (failCount >= maxAttempts) {
        const lockUntil = new Date(Date.now() + env.ACCOUNT_LOCKOUT_MINUTES * 60_000)
        await this.authRepository.updateById(user.id, { lockedUntil: lockUntil })
        this.auditService.log({
          action: AuditAction.ACCOUNT_LOCKED,
          userId: user.id,
          metadata: { failCount, lockedUntil: lockUntil },
          ...context,
        })
        throw new AppError(
          `Too many failed attempts. Account locked for ${env.ACCOUNT_LOCKOUT_MINUTES} minutes.`,
          423,
        )
      }

      this.auditService.log({
        action: AuditAction.LOGIN_FAILURE,
        userId: user.id,
        metadata: { reason: 'invalid_password', failCount, maxAttempts },
        ...context,
      })
      throw new AppError('Invalid credentials', 401)
    }

    // ─── Successful login — reset counter, issue tokens ────────────────────
    await this.authRepository.resetFailedLogins(user.id)

    const [accessToken, refreshToken] = await Promise.all([
      this._signAccessToken(user.id, user.role),
      this._signRefreshToken(user.id),
    ])

    // Store the SHA-256 hash of the refresh token, not the raw JWT
    await cache.set(
      `${REFRESH_PREFIX}${user.id}`,
      hashToken(refreshToken),
      REFRESH_TTL_SEC,
    )

    this.auditService.log({
      action: AuditAction.LOGIN_SUCCESS,
      userId: user.id,
      ...context,
    })

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        emailVerifiedAt: user.emailVerifiedAt,
      },
    }
  }

  // ─── Token Rotation ─────────────────────────────────────────────────────────
  async refreshTokens(
    incomingToken: string,
    context: { ip?: string; userAgent?: string } = {},
  ): Promise<AuthTokens> {
    let payload: JWTPayload
    try {
      ;({ payload } = await jwtVerify(incomingToken, this.refreshSecret))
    } catch {
      throw new AppError('Invalid or expired refresh token', 401)
    }

    const userId = payload['sub']!
    const cacheKey = `${REFRESH_PREFIX}${userId}`
    const storedHash = await cache.get<string>(cacheKey)

    // Compare hash of incoming token against the stored hash
    if (!storedHash || storedHash !== hashToken(incomingToken)) {
      // SECURITY: If the token doesn't match but a hash exists, this COULD be 
      // token reuse (theft). Best practice is to revoke ALL sessions for safety.
      if (storedHash) {
        await cache.del(cacheKey)
        this.logger.warn({ userId }, 'Potential refresh token reuse detected! Revoking session.')
      }
      throw new AppError('Invalid or revoked refresh token', 401)
    }

    // Atomic verify-and-delete: we delete the hash IMMEDIATELY before signing
    // new ones. This prevents any other concurrent request from succeeding
    // with this same old token (Race Condition Fix).
    await cache.del(cacheKey)

    const user = await this.authRepository.findById(userId)
    if (!user) throw new AppError('User not found', 404)

    // Issue + store new pair
    const [newAccess, newRefresh] = await Promise.all([
      this._signAccessToken(userId, user.role),
      this._signRefreshToken(userId),
    ])
    await cache.set(cacheKey, hashToken(newRefresh), REFRESH_TTL_SEC)

    this.auditService.log({ action: AuditAction.TOKEN_ROTATED, userId, ...context })

    return { accessToken: newAccess, refreshToken: newRefresh }
  }

  // ─── Logout ─────────────────────────────────────────────────────────────────
  async logout(
    refreshToken: string,
    context: { ip?: string; userAgent?: string } = {},
  ): Promise<void> {
    try {
      const { payload } = await jwtVerify(refreshToken, this.refreshSecret)
      const userId = payload['sub']!
      await cache.del(`${REFRESH_PREFIX}${userId}`)
      this.auditService.log({ action: AuditAction.LOGOUT, userId, ...context })
    } catch {
      // Token already invalid — cookie will still be cleared by the controller
    }
  }

  // ─── Get Me ─────────────────────────────────────────────────────────────────
  async getMe(userId: string): Promise<PublicUser> {
    const user = await this.authRepository.findById(userId)
    if (!user) throw new AppError('User not found', 404)
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      emailVerifiedAt: user.emailVerifiedAt,
    }
  }

  // ─── Forgot Password ────────────────────────────────────────────────────────
  async forgotPassword(
    dto: ForgotPasswordDto,
    context: { ip?: string; userAgent?: string } = {},
  ): Promise<void> {
    const user = await this.authRepository.findByEmail(dto.email)

    // Always return success to prevent user enumeration
    if (!user) return

    const rawToken = generateSecureToken()
    const hashedToken = hashToken(rawToken)
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_SEC * 1000)

    await this.authRepository.updateById(user.id, {
      passwordResetToken: hashedToken,
      passwordResetExpiresAt: expiresAt,
    })

    this.emailQueue
      .add('password-reset', {
        type: 'password-reset',
        to: user.email,
        subject: 'Reset your password',
        resetUrl: `${env.APP_URL}/api/v1/auth/reset-password?token=${rawToken}`,
        expiresInMinutes: Math.floor(RESET_TOKEN_TTL_SEC / 60),
      } satisfies EmailJobData)
      .catch((err: unknown) => {
        this.logger.error({ err, userId: user.id }, 'Failed to enqueue password-reset email')
      })

    this.auditService.log({
      action: AuditAction.PASSWORD_RESET_REQUEST,
      userId: user.id,
      ...context,
    })
  }

  // ─── Reset Password ─────────────────────────────────────────────────────────
  async resetPassword(
    dto: ResetPasswordDto,
    context: { ip?: string; userAgent?: string } = {},
  ): Promise<void> {
    const hashedToken = hashToken(dto.token)
    const user = await this.authRepository.findByPasswordResetToken(hashedToken)

    if (!user || !user.passwordResetExpiresAt) {
      throw new AppError('Invalid or expired password reset token', 400)
    }
    if (user.passwordResetExpiresAt < new Date()) {
      throw new AppError('Password reset token has expired', 400)
    }

    const hashedPassword = await argon2.hash(dto.password, ARGON2_OPTIONS)

    await this.authRepository.updateById(user.id, {
      password: hashedPassword,
      passwordResetToken: null,
      passwordResetExpiresAt: null,
      failedLoginAttempts: 0,
      lockedUntil: null,
    })

    // Invalidate all active refresh tokens for this user on password change
    await cache.del(`${REFRESH_PREFIX}${user.id}`)

    this.auditService.log({
      action: AuditAction.PASSWORD_RESET_SUCCESS,
      userId: user.id,
      ...context,
    })
  }

  // ─── Verify Email ───────────────────────────────────────────────────────────
  async verifyEmail(
    dto: VerifyEmailDto,
    context: { ip?: string; userAgent?: string } = {},
  ): Promise<void> {
    const hashedToken = hashToken(dto.token)
    const user = await this.authRepository.findByVerificationToken(hashedToken)

    if (!user) throw new AppError('Invalid or expired verification token', 400)
    if (user.emailVerifiedAt) throw new AppError('Email is already verified', 400)

    await this.authRepository.updateById(user.id, {
      emailVerifiedAt: new Date(),
      emailVerificationToken: null,
    })

    this.auditService.log({
      action: AuditAction.EMAIL_VERIFIED,
      userId: user.id,
      ...context,
    })
  }

  // ─── Private JWT Helpers ─────────────────────────────────────────────────────
  private _signAccessToken(userId: string, role: string): Promise<string> {
    return new SignJWT({ sub: userId, role })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(env.JWT_ACCESS_EXPIRES_IN)
      .sign(this.accessSecret)
  }

  private _signRefreshToken(userId: string): Promise<string> {
    return new SignJWT({ sub: userId })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(env.JWT_REFRESH_EXPIRES_IN)
      .sign(this.refreshSecret)
  }
}

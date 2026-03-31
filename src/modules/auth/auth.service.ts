import argon2 from 'argon2'
import type { Logger } from 'pino'
import { SignJWT, jwtVerify, JWTPayload } from 'jose'

import { env } from '@/config'
import { cache } from '@/infrastructure'
import { AppError } from '@/utils/AppError'
import type { AuthRepository } from './auth.repository'
import type { RegisterDto, LoginDto } from './auth.schema'

const ARGON2_OPTIONS: argon2.Options & { raw?: false } = {
      type: argon2.argon2id,
      memoryCost: 65536, // 64 MB — OWASP recommended minimum
      timeCost: 3,
      parallelism: 4,
}

const REFRESH_PREFIX = 'refresh_token:'
const REFRESH_TTL_SEC = 7 * 24 * 60 * 60 // 7 days

/**
 * AuthService — Business Logic Layer.
 * Handles password hashing (Argon2id), JWT issuance/rotation, and Redis session storage.
 * Constructor parameters are injected by the awilix DI container.
 */
export class AuthService {
      private readonly accessSecret: Uint8Array
      private readonly refreshSecret: Uint8Array

      constructor(
            private readonly authRepository: AuthRepository,
            private readonly logger: Logger,
      ) {
            this.accessSecret = new TextEncoder().encode(env.JWT_ACCESS_SECRET)
            this.refreshSecret = new TextEncoder().encode(
                  env.JWT_REFRESH_SECRET,
            )
      }

      // ─── Register ───────────────────────────────────────────────────────────────
      async register(dto: RegisterDto) {
            const existing = await this.authRepository.findByEmail(dto.email)
            if (existing) throw new AppError('Email is already registered', 409)

            const hashedPassword = await argon2.hash(
                  dto.password,
                  ARGON2_OPTIONS,
            )
            const user = await this.authRepository.create({
                  email: dto.email,
                  password: hashedPassword,
            })

            this.logger.info({ userId: user.id }, 'New user registered')
            return { id: user.id, email: user.email, role: user.role }
      }

      // ─── Login ──────────────────────────────────────────────────────────────────
      async login(dto: LoginDto) {
            const user = await this.authRepository.findByEmail(dto.email)
            // Use consistent error message to prevent user enumeration
            if (!user) throw new AppError('Invalid credentials', 401)

            const isValid = await argon2.verify(
                  user.password,
                  dto.password,
                  ARGON2_OPTIONS,
            )
            if (!isValid) throw new AppError('Invalid credentials', 401)

            const [accessToken, refreshToken] = await Promise.all([
                  this._signAccessToken(user.id, user.role),
                  this._signRefreshToken(user.id),
            ])

            await cache.set(
                  `${REFRESH_PREFIX}${user.id}`,
                  refreshToken,
                  REFRESH_TTL_SEC,
            )
            this.logger.info({ userId: user.id }, 'User logged in')

            return {
                  accessToken,
                  refreshToken,
                  user: { id: user.id, email: user.email, role: user.role },
            }
      }

      // ─── Token Rotation ─────────────────────────────────────────────────────────
      async refreshTokens(incomingToken: string) {
            let payload: JWTPayload
            try {
                  ;({ payload } = await jwtVerify(
                        incomingToken,
                        this.refreshSecret,
                  ))
            } catch {
                  throw new AppError('Invalid or expired refresh token', 401)
            }

            const userId = payload['sub']!
            const stored = await cache.get<string>(`${REFRESH_PREFIX}${userId}`)

            // Strict token comparison prevents refresh token reuse attacks
            if (!stored || stored !== incomingToken) {
                  throw new AppError('Refresh token has been revoked', 401)
            }

            const user = await this.authRepository.findById(userId)
            if (!user) throw new AppError('User not found', 404)

            // Rotate: invalidate old token, issue new pair atomically
            await cache.del(`${REFRESH_PREFIX}${userId}`)
            const [newAccess, newRefresh] = await Promise.all([
                  this._signAccessToken(userId, user.role),
                  this._signRefreshToken(userId),
            ])
            await cache.set(
                  `${REFRESH_PREFIX}${userId}`,
                  newRefresh,
                  REFRESH_TTL_SEC,
            )

            this.logger.info({ userId }, 'Tokens rotated')
            return { accessToken: newAccess, refreshToken: newRefresh }
      }

      // ─── Logout ─────────────────────────────────────────────────────────────────
      async logout(refreshToken: string): Promise<void> {
            try {
                  const { payload } = await jwtVerify(
                        refreshToken,
                        this.refreshSecret,
                  )
                  await cache.del(`${REFRESH_PREFIX}${payload['sub']!}`)
                  this.logger.info(
                        { userId: payload['sub'] },
                        'User logged out',
                  )
            } catch {
                  // Token already invalid — still clear the cookie on the controller side
            }
      }

      // ─── Private JWT Helpers ────────────────────────────────────────────────────
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

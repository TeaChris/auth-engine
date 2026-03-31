import {
      createContainer,
      asClass,
      asValue,
      InjectionMode,
      AwilixContainer,
} from 'awilix'
import type { PrismaClient } from '@prisma/client'
import type { Logger } from 'pino'
import { prisma } from '@/infrastructure/database/prisma'
import { logger } from '@/infrastructure/logger'
import { AuthRepository } from '@/modules/auth/auth.repository'
import { AuthService } from '@/modules/auth/auth.service'

export interface AppCradle {
      // Infrastructure — registered as values (already-created singletons)
      prisma: PrismaClient
      logger: Logger

      // Auth domain
      authRepository: AuthRepository
      authService: AuthService
}

/**
 * awilix DI container — CLASSIC injection mode (constructor parameter order matters).
 * Services are registered as singletons so they're only instantiated once.
 *
 * AuthRepository constructor: (prisma)
 * AuthService constructor:    (authRepository, logger)
 */
const container: AwilixContainer<AppCradle> = createContainer<AppCradle>({
      injectionMode: InjectionMode.CLASSIC,
})

container.register({
      // ─── Infrastructure values ─────────────────────────────────────────────────
      prisma: asValue(prisma),
      logger: asValue(logger),

      // ─── Auth domain ──────────────────────────────────────────────────────────
      authRepository: asClass(AuthRepository).singleton(),
      authService: asClass(AuthService).singleton(),
})

export { container }

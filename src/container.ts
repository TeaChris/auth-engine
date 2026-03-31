import {
      asValue,
      asClass,
      InjectionMode,
      AwilixContainer,
      createContainer,
} from 'awilix'
import type { Logger } from 'pino'
import type { Queue } from 'bullmq'
import type { PrismaClient } from '@prisma/client'

import { prisma, logger, createQueue } from '@/infrastructure'
import { AuthRepository, AuthService, EmailWorker } from '@/modules'

export interface AppCradle {
      // Infrastructure
      prisma: PrismaClient
      logger: Logger
      emailQueue: Queue

      // Domain modules
      authRepository: AuthRepository
      authService: AuthService
      emailWorker: EmailWorker
}

/**
 * awilix DI container
 */
const container: AwilixContainer<AppCradle> = createContainer<AppCradle>({
      injectionMode: InjectionMode.CLASSIC,
})

container.register({
      // ─── Infrastructure values ─────────────────────────────────────────────────
      prisma: asValue(prisma),
      logger: asValue(logger),
      emailQueue: asValue(createQueue('email-queue')),

      // ─── Domain modules ───────────────────────────────────────────────────────
      authRepository: asClass(AuthRepository).singleton(),
      authService: asClass(AuthService).singleton(),
      emailWorker: asClass(EmailWorker).singleton(),
})

export { container }

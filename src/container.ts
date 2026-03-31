import {
  createContainer,
  asClass,
  asValue,
  InjectionMode,
  AwilixContainer,
} from 'awilix'
import type { PrismaClient } from '@prisma/client'
import type { Logger } from 'pino'
import type { Queue } from 'bullmq'
import { prisma, logger, createQueue } from '@/infrastructure'
import { AuthRepository } from '@/modules/auth/auth.repository'
import { AuthService } from '@/modules/auth/auth.service'
import { EmailWorker } from '@/modules/notifications/email.worker'

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

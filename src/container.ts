import {
  asValue,
  asClass,
  InjectionMode,
  type AwilixContainer,
  createContainer,
} from 'awilix'
import type { Logger } from 'pino'
import type { Queue } from 'bullmq'
import type { PrismaClient } from '@prisma/client'

import { prisma, logger, createQueue } from '@/infrastructure'
import { AuthRepository, AuthService, AuditService, EmailWorker } from '@/modules'

/**
 * AppCradle — typed registry of every dependency in the DI container.
 * Extend this when adding new modules.
 */
export interface AppCradle {
  // ─── Infrastructure ──────────────────────────────────────────────────────────
  prisma: PrismaClient
  emailQueue: Queue
  logger: Logger

  // ─── Domain modules ──────────────────────────────────────────────────────────
  auditService: AuditService
  authRepository: AuthRepository
  authService: AuthService
  emailWorker: EmailWorker
}

/**
 * Awilix DI container — CLASSIC injection mode means constructors receive
 * their dependencies as positional arguments (matching the declared order).
 */
const container: AwilixContainer<AppCradle> = createContainer<AppCradle>({
  injectionMode: InjectionMode.CLASSIC,
})

container.register({
  // ─── Infrastructure (values — already instantiated) ─────────────────────────
  prisma: asValue(prisma),
  logger: asValue(logger),
  emailQueue: asValue(createQueue('email-queue')),

  // ─── Auth domain ─────────────────────────────────────────────────────────────
  // Registration order matters: dependencies before dependants.
  auditService: asClass(AuditService).singleton(),   // prisma, logger
  authRepository: asClass(AuthRepository).singleton(), // prisma
  authService: asClass(AuthService).singleton(),      // authRepository, logger, emailQueue, auditService
  emailWorker: asClass(EmailWorker).singleton(),       // (no deps — creates its own worker internally)
})

export { container }

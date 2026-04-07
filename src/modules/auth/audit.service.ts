import type { Logger } from 'pino'
import type { PrismaClient } from '@prisma/client'
import type { AuditEventInput } from './audit.types'

/**
 * AuditService — Compliance & Security Audit Layer.
 *
 * Every critical auth event is recorded in TWO ways:
 *   1. Structured JSON log via Pino → picked up by any log aggregator (ELK, Datadog, etc.)
 *   2. Persisted row in the `audit_logs` DB table → survives log rotation, queryable
 *
 * Design: fire-and-forget DB write. If the DB write fails, the error is logged
 * and the request is NOT blocked — audit logging must never degrade UX.
 */
export class AuditService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly logger: Logger,
  ) {}

  /**
   * Records a single auth audit event.
   * Call this after every security-relevant action (login, logout, reset, etc.).
   */
  log(event: AuditEventInput): void {
    // 1. Structured log entry (synchronous — never blocks)
    this.logger.info(
      {
        audit: true,
        action: event.action,
        userId: event.userId,
        ip: event.ip,
        userAgent: event.userAgent,
        metadata: event.metadata,
      },
      `[AUDIT] ${event.action}`,
    )

    // 2. Persist to DB (fire-and-forget — failures are logged but don't block)
    this.prisma.auditLog
      .create({
        data: {
          userId: event.userId ?? null,
          action: event.action,
          ip: event.ip ?? null,
          userAgent: event.userAgent ?? null,
          metadata: event.metadata ?? undefined,
        },
      })
      .catch((err: unknown) => {
        this.logger.error(
          { err, event },
          '[AUDIT] Failed to persist audit log entry to DB',
        )
      })
  }
}

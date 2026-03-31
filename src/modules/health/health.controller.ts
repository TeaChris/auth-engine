import { Router, Request, Response } from 'express'
import { cache, prisma, logger } from '@/infrastructure'

const router = Router()

/**
 * GET /health
 * Returns system metrics: uptime, memory, DB latency, Redis latency, PID, node version.
 * Returns 200 if all services are healthy, 503 if any are degraded.
 */
router.get('/', async (_req: Request, res: Response) => {
      const requestStart = Date.now()

      const [dbResult, redisResult] = await Promise.allSettled([
            (async () => {
                  const t = Date.now()
                  await prisma.$queryRaw`SELECT 1`
                  return Date.now() - t
            })(),
            (async () => {
                  const t = Date.now()
                  await cache.ping()
                  return Date.now() - t
            })(),
      ])

      const dbOk = dbResult.status === 'fulfilled'
      const redisOk = redisResult.status === 'fulfilled'
      const isHealthy = dbOk && redisOk

      if (!isHealthy) {
            logger.warn(
                  {
                        db: dbOk
                              ? 'ok'
                              : (dbResult as PromiseRejectedResult).reason,
                        redis: redisOk
                              ? 'ok'
                              : (redisResult as PromiseRejectedResult).reason,
                  },
                  'Health check: degraded',
            )
      }

      const mem = process.memoryUsage()

      res.status(isHealthy ? 200 : 503).json({
            success: isHealthy,
            status: isHealthy ? 'healthy' : 'degraded',
            timestamp: new Date().toISOString(),
            responseTimeMs: Date.now() - requestStart,
            system: {
                  uptimeSeconds: Math.floor(process.uptime()),
                  pid: process.pid,
                  nodeVersion: process.version,
                  memory: {
                        rssMB: Math.round(mem.rss / 1024 / 1024),
                        heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
                        heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
                        externalMB: Math.round(mem.external / 1024 / 1024),
                  },
            },
            services: {
                  database: {
                        status: dbOk ? 'connected' : 'error',
                        latencyMs: dbOk
                              ? (dbResult as PromiseFulfilledResult<number>)
                                      .value
                              : null,
                        error: dbOk
                              ? null
                              : String(
                                      (dbResult as PromiseRejectedResult)
                                            .reason,
                                ),
                  },
                  redis: {
                        status: redisOk ? 'connected' : 'error',
                        latencyMs: redisOk
                              ? (redisResult as PromiseFulfilledResult<number>)
                                      .value
                              : null,
                        error: redisOk
                              ? null
                              : String(
                                      (redisResult as PromiseRejectedResult)
                                            .reason,
                                ),
                  },
            },
      })
})

export { router as healthRouter }

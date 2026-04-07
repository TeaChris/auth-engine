import { Queue, Worker, type QueueOptions, type WorkerOptions, type Job, type RedisOptions } from 'bullmq'
import { logger } from '@/infrastructure'

// ─── Redis Configuration ──────────────────────────────────────────────────────
// Parse the validated REDIS_URL rather than reading raw env vars directly.
// This ensures BullMQ uses the same Redis instance as every other subsystem.
const buildRedisConnection = (): RedisOptions => {
  const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379'
  try {
    const url = new URL(redisUrl)
    return {
      host: url.hostname,
      port: Number(url.port) || 6379,
      ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
      ...(url.pathname && url.pathname !== '/' ? { db: Number(url.pathname.slice(1)) } : {}),
    }
  } catch {
    logger.warn({ redisUrl }, 'Could not parse REDIS_URL; falling back to localhost:6379')
    return { host: 'localhost', port: 6379 }
  }
}

const redisConnection: RedisOptions = buildRedisConnection()

// ─── Retry Strategy ───────────────────────────────────────────────────────────
// Exponential backoff: 1 s, 2 s, 4 s (capped at 3 attempts)
export const defaultJobOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 1000,
  },
  removeOnComplete: true,
  removeOnFail: false,
} as const

/**
 * Factory that creates a typed BullMQ Queue wired to the shared Redis connection.
 */
export const createQueue = <T = unknown>(
  name: string,
  options?: Partial<QueueOptions>,
): Queue<T> =>
  new Queue<T>(name, {
    connection: redisConnection,
    defaultJobOptions,
    ...options,
  })

/**
 * Factory that creates a BullMQ Worker with structured logging on lifecycle events.
 */
export const createWorker = <T = unknown>(
  name: string,
  processor: (job: Job<T>) => Promise<void>,
  options?: Partial<WorkerOptions>,
): Worker<T> => {
  const worker = new Worker<T>(name, processor, {
    connection: redisConnection,
    ...options,
  })

  worker.on('active', (job) =>
    logger.info({ queue: name, jobId: job.id }, `Job ${job.id} started`),
  )
  worker.on('completed', (job) =>
    logger.info({ queue: name, jobId: job.id }, `Job ${job.id} completed`),
  )
  worker.on('failed', (job, err) =>
    logger.error({ queue: name, jobId: job?.id, err }, `Job ${job?.id} failed`),
  )

  return worker
}

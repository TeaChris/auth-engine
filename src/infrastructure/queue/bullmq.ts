import { Queue, Worker, QueueOptions, WorkerOptions, Job, RedisOptions } from 'bullmq';
import { logger } from '@/infrastructure';

// ─── Redis Configuration ──────────────────────────────────────────────────
// BullMQ requires a standard Redis connection or ioredis instance
const redisConnection: RedisOptions = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
};

// ─── Retry Strategy ────────────────────────────────────────────────────────
// Exponential backoff: 1s, 2s, 4s, 8s...
export const defaultJobOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 1000,
  },
  removeOnComplete: true,
  removeOnFail: false,
};

/**
 * Base configuration for BullMQ queues.
 */
export const createQueue = (name: string, options?: Partial<QueueOptions>) => {
  return new Queue(name, {
    connection: redisConnection,
    defaultJobOptions,
    ...options,
  });
};

/**
 * Base configuration for BullMQ workers.
 */
export const createWorker = (
  name: string,
  processor: (job: Job) => Promise<void>,
  options?: Partial<WorkerOptions>
) => {
  const worker = new Worker(name, processor, {
    connection: redisConnection,
    ...options,
  });

  worker.on('active', (job) => {
    logger.info({ queue: name, jobId: job.id }, `🚀 Job ${job.id} started`);
  });

  worker.on('completed', (job) => {
    logger.info({ queue: name, jobId: job.id }, `✅ Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    logger.error({ queue: name, jobId: job?.id, error: err.message }, `❌ Job ${job?.id} failed`);
  });

  return worker;
};

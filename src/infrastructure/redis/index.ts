import Redis from 'ioredis'
import { logger } from '@/infrastructure'

let _redis: Redis

const createRedisClient = (): Redis => {
      const client = new Redis(
            process.env['REDIS_URL'] || 'redis://localhost:6379',
            {
                  lazyConnect: true,
                  maxRetriesPerRequest: 3,
                  enableReadyCheck: true,
                  retryStrategy: (times: number) => {
                        if (times > 5) {
                              logger.error(
                                    'Redis: Max retries reached. Giving up.',
                              )
                              return null // stop retrying
                        }
                        const delay = Math.min(times * 250, 3000)
                        logger.warn(
                              { attempt: times, delayMs: delay },
                              'Redis: Retrying connection...',
                        )
                        return delay
                  },
            },
      )

      client.on('connect', () => logger.info('✅ Redis connected'))
      client.on('ready', () => logger.info('✅ Redis ready'))
      client.on('error', (err) => logger.error({ err }, 'Redis error'))
      client.on('close', () => logger.warn('Redis connection closed'))
      client.on('reconnecting', () => logger.warn('Redis reconnecting...'))

      return client
}

export const connectRedis = async (): Promise<void> => {
      _redis = createRedisClient()
      await _redis.connect()
}

/** Returns the initialized Redis client. Must call connectRedis() first. */
export const getRedis = (): Redis => {
      if (!_redis)
            throw new Error('Redis not initialized. Call connectRedis() first.')
      return _redis
}

// ─── Typed Cache Helpers ──────────────────────────────────────────────────────
export const cache = {
      async get<T>(key: string): Promise<T | null> {
            const raw = await getRedis().get(key)
            if (!raw) return null
            try {
                  return JSON.parse(raw) as T
            } catch {
                  return raw as unknown as T
            }
      },

      async set(
            key: string,
            value: unknown,
            ttlSeconds?: number,
      ): Promise<void> {
            const serialized = JSON.stringify(value)
            if (ttlSeconds) {
                  await getRedis().setex(key, ttlSeconds, serialized)
            } else {
                  await getRedis().set(key, serialized)
            }
      },

      async del(...keys: string[]): Promise<void> {
            if (keys.length) await getRedis().del(...keys)
      },

      async exists(key: string): Promise<boolean> {
            return (await getRedis().exists(key)) === 1
      },

      async ping(): Promise<string> {
            return getRedis().ping()
      },
}

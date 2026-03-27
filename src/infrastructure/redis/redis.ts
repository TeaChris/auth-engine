import Redis from 'ioredis';
import { env } from '@/config/env';

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  lazyConnect: true,
});

export const connectRedis = async () => {
  try {
    await redis.connect();
    console.log('Redis connected successfully');
  } catch (error) {
    console.error('Redis connection failed', error);
  }
};

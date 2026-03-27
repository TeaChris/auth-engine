import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '@/infrastructure/database/prisma';
import { redis } from '@/infrastructure/redis/redis';
import { logger } from '@/infrastructure/logger/winston';

const router = Router();

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // 1. Check PostgreSQL
    await prisma.$queryRaw`SELECT 1`;
    
    // 2. Check Redis
    const redisStatus = redis.status; // 'connecting', 'connect', 'ready', etc.
    if (redisStatus !== 'ready') {
      throw new Error(`Redis not ready. Status: ${redisStatus}`);
    }

    res.status(200).json({
      success: true,
      message: 'System is healthy',
      timestamp: new Date().toISOString(),
      services: {
        database: 'connected',
        redis: redisStatus,
      },
    });
  } catch (error) {
    logger.error('Health check failed', error);
    res.status(503).json({
      success: false,
      message: 'System is unhealthy',
      timestamp: new Date().toISOString(),
    });
  }
});

export { router as healthRouter };

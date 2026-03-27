import { createServer } from './server';
import { env } from '@/config/env';
import { logger } from '@/infrastructure/logger/winston';
import { connectDB, prisma } from '@/infrastructure/database/prisma';
import { connectRedis, redis } from '@/infrastructure/redis/redis';

const startServer = async () => {
  try {
    // 1. Establish Database connections
    await connectDB();
    await connectRedis();

    // 2. Initialize Express application
    const app = createServer();

    // 3. Start listening
    const server = app.listen(env.PORT, () => {
      logger.info(`🚀 Server running in ${env.NODE_ENV} mode on port ${env.PORT}`);
    });

    // 4. Graceful Shutdown orchestration
    const gracefulShutdown = async (signal: string) => {
      logger.info(`Received ${signal}. Graceful shutdown initiated...`);
      server.close(async () => {
        logger.info('HTTP server closed.');
        try {
          await prisma.$disconnect();
          logger.info('Prisma disconnected.');
          
          redis.disconnect();
          logger.info('Redis disconnected.');

          process.exit(0);
        } catch (error) {
          logger.error('Error during graceful shutdown:', error);
          process.exit(1);
        }
      });

      // Force shutdown after 10 seconds if connections are hanging
      setTimeout(() => {
        logger.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

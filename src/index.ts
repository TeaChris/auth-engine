import 'dotenv/config';
import cluster from 'cluster';
import os from 'os';
import { createServer } from './server';
import { env } from '@/config/env';
import { logger } from '@/infrastructure/logger/pino';
import { connectDB } from '@/infrastructure/database/prisma';
import { connectRedis } from '@/infrastructure/redis/redis';
import { registerGracefulShutdown } from '@/utils/gracefulShutdown';

const startServer = async (): Promise<void> => {
  try {
    // 1. Validate & connect infrastructure (fail-fast before serving any traffic)
    await connectDB();
    await connectRedis();

    // 2. Compose the Express application
    const app = createServer();

    // 3. Start listening
    const server = app.listen(env.PORT, () => {
      logger.info(
        { port: env.PORT, env: env.NODE_ENV, pid: process.pid },
        '🚀 Server is running',
      );
    });

    // 4. Register graceful shutdown hooks (SIGTERM, SIGINT, uncaughtException)
    registerGracefulShutdown(server);
  } catch (err) {
    logger.fatal({ err }, 'Failed to start server. Exiting.');
    process.exit(1);
  }
};

// ─── Cluster Mode ─────────────────────────────────────────────────────────────
// Enabled via CLUSTER_ENABLED=true in env. PM2 handles this automatically
// in production; built-in cluster is useful for non-PM2 deployments.
if (env.CLUSTER_ENABLED && cluster.isPrimary) {
  const numWorkers = os.cpus().length;
  logger.info({ numWorkers, pid: process.pid }, '🔱 Primary started — forking workers');

  for (let i = 0; i < numWorkers; i++) {
    cluster.fork();
  }

  // Auto-restart dead workers to maintain availability
  cluster.on('exit', (worker, code, signal) => {
    logger.warn(
      { workerId: worker.id, pid: worker.process.pid, code, signal },
      'Worker died — restarting',
    );
    cluster.fork();
  });

  cluster.on('online', (worker) => {
    logger.info({ workerId: worker.id, pid: worker.process.pid }, 'Worker online');
  });
} else {
  // Single process mode (or forked worker in cluster mode)
  startServer();
}

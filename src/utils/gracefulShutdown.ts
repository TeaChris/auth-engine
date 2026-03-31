import { Server } from 'http'
import { disconnectDB, getRedis, logger } from '@/infrastructure'

const SHUTDOWN_TIMEOUT_MS = 10_000

const shutdown = async (
      signal: string,
      server: Server,
      cleanup?: () => Promise<void>,
): Promise<void> => {
      logger.info({ signal }, 'Graceful shutdown initiated. Stopping server...')

      // Stop accepting new HTTP connections
      server.close(async () => {
            logger.info('HTTP server closed')

            try {
                  if (cleanup) {
                        await cleanup()
                        logger.info('Custom cleanup completed')
                  }

                  await disconnectDB()
                  logger.info('Database disconnected')

                  getRedis().disconnect()
                  logger.info('Redis disconnected')

                  logger.info('✅ Graceful shutdown complete')
                  process.exit(0)
            } catch (err) {
                  logger.error({ err }, 'Error during graceful shutdown')
                  process.exit(1)
            }
      })

      // Hard kill logic (unchanged)
}

/**
 * Registers shutdown hooks.
 */
export const registerGracefulShutdown = (
      server: Server,
      cleanup?: () => Promise<void>,
): void => {
      process.on('SIGTERM', () => shutdown('SIGTERM', server, cleanup))
      process.on('SIGINT', () => shutdown('SIGINT', server, cleanup))
      // Handle uncaught errors similarly
}

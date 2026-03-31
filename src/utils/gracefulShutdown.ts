import { Server } from 'http'
import { disconnectDB, getRedis, logger } from '@/infrastructure'

const SHUTDOWN_TIMEOUT_MS = 10_000

const shutdown = async (signal: string, server: Server): Promise<void> => {
      logger.info({ signal }, 'Graceful shutdown initiated. Stopping server...')

      // Stop accepting new HTTP connections
      server.close(async () => {
            logger.info('HTTP server closed')

            try {
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

      // Hard kill if server.close() stalls
      setTimeout(() => {
            logger.error(
                  { timeoutMs: SHUTDOWN_TIMEOUT_MS },
                  'Shutdown timeout exceeded. Forcing process exit.',
            )
            process.exit(1)
      }, SHUTDOWN_TIMEOUT_MS).unref() // .unref() so the timer itself doesn't keep the loop alive
}

/**
 * Registers SIGTERM, SIGINT, uncaughtException, and unhandledRejection
 * handlers on the process for clean shutdown.
 */
export const registerGracefulShutdown = (server: Server): void => {
      process.on('SIGTERM', () => shutdown('SIGTERM', server))
      process.on('SIGINT', () => shutdown('SIGINT', server))

      process.on('uncaughtException', (err) => {
            logger.fatal(
                  { err },
                  'Uncaught exception — initiating emergency shutdown',
            )
            shutdown('uncaughtException', server)
      })

      process.on('unhandledRejection', (reason) => {
            logger.fatal(
                  { reason },
                  'Unhandled promise rejection — initiating emergency shutdown',
            )
            shutdown('unhandledRejection', server)
      })
}

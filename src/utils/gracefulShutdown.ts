import { Server } from 'http'
import { disconnectDB, getRedis, logger } from '@/infrastructure'

const SHUTDOWN_TIMEOUT_MS = 10_000

const shutdown = async (
      signal: string,
      server: Server,
      cleanup?: () => Promise<void>,
): Promise<void> => {
      logger.info({ signal }, 'Graceful shutdown initiated. Stopping server...')

      // ─── Hard-kill timeout (if server.close() stalls) ─────────────────────────
      setTimeout(() => {
            logger.error(
                  { timeoutMs: SHUTDOWN_TIMEOUT_MS },
                  'Shutdown timeout exceeded. Forcing exit.',
            )
            process.exit(1)
      }, SHUTDOWN_TIMEOUT_MS).unref()

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
}

/**
 * Registers SIGTERM, SIGINT, uncaughtException, and unhandledRejection
 * handlers on the process for clean, safe shutdown.
 */
export const registerGracefulShutdown = (
      server: Server,
      cleanup?: () => Promise<void>,
): void => {
      process.on('SIGTERM', () => shutdown('SIGTERM', server, cleanup))
      process.on('SIGINT', () => shutdown('SIGINT', server, cleanup))

      process.on('uncaughtException', (err) => {
            logger.fatal({ err }, 'Uncaught exception — initiating emergency shutdown')
            shutdown('uncaughtException', server, cleanup)
      })

      process.on('unhandledRejection', (reason) => {
            logger.fatal({ reason }, 'Unhandled promise rejection — initiating emergency shutdown')
            shutdown('unhandledRejection', server, cleanup)
      })
}

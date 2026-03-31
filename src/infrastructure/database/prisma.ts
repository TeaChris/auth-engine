import { PrismaClient } from '@prisma/client'
import { logger } from '@/infrastructure'

const MAX_RETRIES = 3
const RETRY_DELAY_MS = 2000

// Prevent multiple Prisma instances in development hot-reloads
const globalForPrisma = globalThis as unknown as {
      prisma: PrismaClient | undefined
}

export const prisma =
      globalForPrisma.prisma ??
      new PrismaClient({
            log:
                  process.env['NODE_ENV'] === 'development'
                        ? [
                                { emit: 'event', level: 'query' },
                                { emit: 'event', level: 'error' },
                                { emit: 'event', level: 'warn' },
                          ]
                        : [{ emit: 'event', level: 'error' }],
      })

if (process.env['NODE_ENV'] !== 'production') {
      globalForPrisma.prisma = prisma
}

// Forward Prisma events to Pino
;(prisma as any).$on('query', (e: any) => {
      logger.debug(
            { query: e.query, duration: `${e.duration}ms` },
            'Prisma query',
      )
})
;(prisma as any).$on('error', (e: any) => {
      logger.error({ message: e.message }, 'Prisma error')
})

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export const connectDB = async (): Promise<void> => {
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                  await prisma.$connect()
                  logger.info('✅ PostgreSQL connected via Prisma')
                  return
            } catch (error) {
                  logger.warn(
                        { attempt, error },
                        `DB connection attempt ${attempt}/${MAX_RETRIES} failed`,
                  )
                  if (attempt < MAX_RETRIES) await sleep(RETRY_DELAY_MS)
            }
      }
      throw new Error(
            `Could not connect to database after ${MAX_RETRIES} attempts`,
      )
}

export const disconnectDB = async (): Promise<void> => {
      await prisma.$disconnect()
      logger.info('PostgreSQL disconnected')
}

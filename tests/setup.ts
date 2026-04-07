import 'dotenv/config'
import { execSync } from 'child_process'
import { prisma } from '@/infrastructure'
import { afterAll, beforeAll } from 'vitest'

/**
 * Global setup for integration tests.
 * Performs a Prisma schema push to the test database to ensure the schema is up-to-date.
 * Note: Assumes DATABASE_URL_TEST is set for true isolation.
 */
beforeAll(async () => {
  try {
    process.stdout.write('🧪 Setting up test database...\n')
    execSync('npx prisma db push --skip-generate', { stdio: 'inherit' })
    process.stdout.write('✅ Test database ready\n')
  } catch (error) {
    process.stderr.write(`❌ Failed to setup test database: ${String(error)}\n`)
    process.exit(1)
  }
})

/**
 * Global teardown for integration tests.
 * Cleans up data and closes the Prisma connection.
 */
afterAll(async () => {
  try {
    // Uncomment to wipe tables between full test runs:
    // const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    //   SELECT tablename FROM pg_tables WHERE schemaname='public'`
    // for (const { tablename } of tables) {
    //   if (tablename !== '_prisma_migrations') {
    //     await prisma.$executeRawUnsafe(`TRUNCATE TABLE "public"."${tablename}" CASCADE;`)
    //   }
    // }
    await prisma.$disconnect()
    process.stdout.write('🧪 Test database disconnected\n')
  } catch (error) {
    process.stderr.write(`❌ Error during test teardown: ${String(error)}\n`)
  }
})

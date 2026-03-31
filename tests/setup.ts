import { execSync } from 'child_process';
import { prisma } from '@/infrastructure';
import { afterAll, beforeAll } from 'vitest';

/**
 * Global setup for integration tests.
 * Performs a Prisma schema push to the test database to ensure the schema is up-to-date.
 * Note: Assumes DATABASE_URL_TEST is set for true isolation.
 */
beforeAll(async () => {
  try {
    console.log('🧪 Setting up test database...');
    // Sync schema to the database (use push for speed in tests)
    execSync('npx prisma db push --skip-generate', { stdio: 'inherit' });
    console.log('✅ Test database ready');
  } catch (error) {
    console.error('❌ Failed to setup test database:', error);
    process.exit(1);
  }
});

/**
 * Global teardown for integration tests.
 * Cleans up data and closes the Prisma connection.
 */
afterAll(async () => {
  try {
    // Optional: Clean up all tables
    // const tablenames = await prisma.$queryRaw<Array<{ tablename: string }>>`SELECT tablename FROM pg_tables WHERE schemaname='public'`;
    // for (const { tablename } of tablenames) {
    //   if (tablename !== '_prisma_migrations') {
    //     await prisma.$executeRawUnsafe(`TRUNCATE TABLE "public"."${tablename}" CASCADE;`);
    //   }
    // }

    await prisma.$disconnect();
    console.log('🧪 Test database disconnected');
  } catch (error) {
    console.error('❌ Error during test teardown:', error);
  }
});

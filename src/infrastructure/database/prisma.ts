import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient({
  log: ['error', 'warn'],
});

export const connectDB = async () => {
  try {
    await prisma.$connect();
    console.log('PostgreSQL (Prisma) connected');
  } catch (error) {
    console.error('Database connection error:', error);
    process.exit(1);
  }
};

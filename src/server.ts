import express, { Application } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import { globalErrorHandler } from '@/middleware/errorHandler';
import { healthRouter } from '@/modules/health/health.controller';

export const createServer = (): Application => {
  const app = express();

  // 1. Security Headers
  app.use(helmet());

  // 2. CORS
  app.use(
    cors({
      origin: ['http://localhost:3000'], // In production, add valid origins
      credentials: true,
    }),
  );

  // 3. Body Parsing
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // 4. Logging
  app.use(morgan('dev'));

  // 5. Routes Definition
  app.use('/health', healthRouter);

  // 6. Global 404 handler
  app.use((req, res, next) => {
    res.status(404).json({ success: false, error: 'Route not found' });
  });

  // 7. Global Error Handler
  app.use(globalErrorHandler);

  return app;
};

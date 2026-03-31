import { AnyZodObject, ZodError } from 'zod';
import { Request, Response, NextFunction, RequestHandler } from 'express';
import { AppError } from '@/utils/AppError';

interface ValidateSchemas {
  body?: AnyZodObject;
  query?: AnyZodObject;
  params?: AnyZodObject;
}

/**
 * Factory that returns a validation middleware for the given Zod schemas.
 * Validates body, query, and/or params in a single pass.
 * Returns a structured 422 on failure.
 */
export const validate = (schemas: ValidateSchemas): RequestHandler =>
  async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (schemas.body) {
        req.body = await schemas.body.parseAsync(req.body);
      }
      if (schemas.query) {
        req.query = await schemas.query.parseAsync(req.query);
      }
      if (schemas.params) {
        req.params = await schemas.params.parseAsync(req.params);
      }
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const details = err.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        }));
        return next(new AppError('Validation failed', 422, details));
      }
      next(err);
    }
  };

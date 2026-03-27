import { Request, Response, NextFunction } from 'express';
import { AnyZodObject, ZodError } from 'zod';
import { AppError } from '@/core/errors/AppError';

export const validateRequest = (schema: AnyZodObject) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errorMessages = error.errors.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        }));
        
        res.status(400).json({
          success: false,
          error: {
            message: 'Validation failed',
            details: errorMessages,
          },
        });
      } else {
        next(error);
      }
    }
  };
};

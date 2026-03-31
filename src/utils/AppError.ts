export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly details?: unknown;

  constructor(message: string, statusCode = 500, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.isOperational = true;
    this.details = details;

    // Maintain proper stack trace in V8
    Error.captureStackTrace(this, this.constructor);
  }
}

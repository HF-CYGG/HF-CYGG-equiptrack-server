import type { Request, Response, NextFunction } from "express";

export class HttpError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    Object.setPrototypeOf(this, HttpError.prototype);
  }
}

export function notFound(req: Request, res: Response, next: NextFunction) {
  const error = new HttpError(`Not Found - ${req.originalUrl}`, 404);
  next(error);
}

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  console.error(`[ErrorHandler] ${req.method} ${req.path}`, err); // Log the error with context

  let status = 500;
  let message = "Internal Server Error";

  if (err instanceof HttpError) {
    status = err.status;
    message = err.message;
  } else if (err.status) {
    // Handle legacy/ad-hoc errors with status property
    status = err.status;
    message = err.message;
  }

  res.status(status).json({ message });
}

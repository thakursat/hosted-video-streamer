import type { Request, Response, NextFunction, ErrorRequestHandler } from 'express';

export const errorHandler: ErrorRequestHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
) => {
  console.error('[error]', err.message);
  if (res.headersSent) return;
  res.status(500).json({ error: err.message || 'Internal server error' });
};

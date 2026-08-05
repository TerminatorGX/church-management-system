import type { NextFunction, Request, RequestHandler, Response } from "express";

/**
 * Express 4 does not forward rejected promises to the error middleware, so an
 * async handler that throws would hang the request. Every route wraps in this.
 */
export const asyncHandler =
  <T extends Request>(fn: (req: T, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req as T, res, next).catch(next);
  };

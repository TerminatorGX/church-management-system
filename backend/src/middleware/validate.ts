import type { NextFunction, Request, Response } from "express";
import { ZodError, type ZodTypeAny } from "zod";
import { badRequest } from "../lib/http-error";

type Source = "body" | "query" | "params";

const flatten = (err: ZodError) =>
  err.issues.map((i) => ({
    field: i.path.join(".") || "(root)",
    message: i.message,
  }));

/**
 * Parses and *replaces* the request segment with the validated result, so
 * handlers get coerced types (numbers, dates, enums) rather than raw strings.
 */
export const validate =
  (schema: ZodTypeAny, source: Source = "body") =>
  (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      return next(badRequest("Validation failed", flatten(result.error)));
    }
    // req.query is a getter in Express 5-style setups; assign defensively.
    Object.defineProperty(req, source, { value: result.data, writable: true, configurable: true });
    next();
  };

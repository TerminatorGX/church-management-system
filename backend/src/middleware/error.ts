import type { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { env } from "../config/env";
import { HttpError } from "../lib/http-error";

export const notFoundHandler = (req: Request, res: Response) => {
  res.status(404).json({ error: `No route matches ${req.method} ${req.originalUrl}` });
};

/** Turns Prisma's error codes into messages a church secretary can act on. */
const fromPrisma = (err: Prisma.PrismaClientKnownRequestError) => {
  const target = (err.meta?.target as string[] | undefined)?.join(", ");
  switch (err.code) {
    case "P2002":
      return { status: 409, error: `That ${target ?? "value"} is already in use` };
    case "P2003":
      return { status: 400, error: "Referenced record does not exist" };
    case "P2025":
      return { status: 404, error: "Record not found" };
    default:
      return null;
  }
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const errorHandler = (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const mapped = fromPrisma(err);
    if (mapped) return res.status(mapped.status).json({ error: mapped.error });
  }

  if (err instanceof Prisma.PrismaClientInitializationError) {
    console.error(err);
    return res.status(503).json({
      error: "Cannot reach the database. Check DATABASE_URL in backend/.env and that Postgres is running.",
    });
  }

  console.error(err);
  return res.status(500).json({
    error: "Something went wrong on our end",
    ...(env.NODE_ENV === "development" && err instanceof Error ? { stack: err.stack } : {}),
  });
};

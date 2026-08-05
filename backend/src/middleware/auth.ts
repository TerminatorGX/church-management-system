import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import type { Role } from "@prisma/client";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { forbidden, unauthorized } from "../lib/http-error";
import { asyncHandler } from "../lib/async-handler";

export interface AuthedUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  memberId: string | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthedUser;
    }
  }
}

export interface TokenPayload {
  sub: string;
}

export const signToken = (userId: string) =>
  jwt.sign({ sub: userId } satisfies TokenPayload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  } as jwt.SignOptions);

/**
 * Verifies the bearer token and re-reads the user from the database on every
 * request. Slightly more work than trusting the JWT claims, but it means
 * deactivating an account or changing a role takes effect immediately instead
 * of waiting for the token to expire.
 */
export const requireAuth = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) throw unauthorized();

  const token = header.slice("Bearer ".length).trim();

  let payload: TokenPayload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET) as TokenPayload;
  } catch {
    throw unauthorized("Session expired or invalid — please sign in again");
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, email: true, name: true, role: true, memberId: true, isActive: true },
  });

  if (!user) throw unauthorized("Account no longer exists");
  if (!user.isActive) throw forbidden("This account has been deactivated");

  const { isActive: _isActive, ...authed } = user;
  req.user = authed;
  next();
});

/** Restricts a route to the listed roles. ADMIN always passes. */
export const requireRole =
  (...roles: Role[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized());
    if (req.user.role === "ADMIN" || roles.includes(req.user.role)) return next();
    next(forbidden(`This action requires one of: ${["ADMIN", ...roles].join(", ")}`));
  };

/** Anything that writes to the contributions ledger. */
export const requireFinance = requireRole("FINANCE");

/** Anything that writes member, event, attendance or volunteer data. */
export const requireStaff = requireRole("FINANCE", "DEPT_HEAD");

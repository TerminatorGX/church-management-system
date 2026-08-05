import { PrismaClient } from "@prisma/client";
import { env } from "../config/env";

/**
 * Single client for the process. `tsx watch` reloads the module graph on every
 * save, so without the global cache dev servers leak connection pools until
 * Postgres refuses new connections.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

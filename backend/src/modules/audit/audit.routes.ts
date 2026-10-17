import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../lib/async-handler";
import { validate } from "../../middleware/validate";
import { requireAuth, requireRole } from "../../middleware/auth";
import { paginated, paginationSchema, toSkipTake } from "../../lib/pagination";

export const auditRouter = Router();
auditRouter.use(requireAuth, requireRole());

const listQuery = paginationSchema.extend({
  entity: z.string().trim().optional(),
  action: z.enum(["CREATE", "UPDATE", "DELETE", "LOGIN", "EXPORT"]).optional(),
  userId: z.string().uuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

const buildWhere = (q: z.infer<typeof listQuery>): Prisma.AuditLogWhereInput => ({
  ...(q.entity ? { entity: q.entity } : {}),
  ...(q.action ? { action: q.action } : {}),
  ...(q.userId ? { userId: q.userId } : {}),
  ...(q.from || q.to
    ? {
        createdAt: {
          ...(q.from ? { gte: q.from } : {}),
          ...(q.to ? { lte: q.to } : {}),
        },
      }
    : {}),
});

/** Read-only: audit log rows are append-only, written via lib/audit.ts. */
auditRouter.get(
  "/",
  validate(listQuery, "query"),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as z.infer<typeof listQuery>;
    const where = buildWhere(q);

    const [data, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        ...toSkipTake(q),
        orderBy: { createdAt: "desc" },
        include: { user: { select: { id: true, name: true, email: true } } },
      }),
      prisma.auditLog.count({ where }),
    ]);

    res.json(paginated(data, total, q));
  }),
);

/** Distinct entity names seen so far, to populate the filter dropdown. */
auditRouter.get(
  "/entities",
  asyncHandler(async (_req, res) => {
    const rows = await prisma.auditLog.findMany({
      distinct: ["entity"],
      select: { entity: true },
      orderBy: { entity: "asc" },
    });
    res.json({ data: rows.map((r) => r.entity) });
  }),
);

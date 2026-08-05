import type { Request } from "express";
import { prisma } from "./prisma";

interface AuditInput {
  action: "CREATE" | "UPDATE" | "DELETE" | "LOGIN" | "EXPORT";
  entity: string;
  entityId?: string | null;
  summary?: string;
}

/**
 * Fire-and-forget. An audit write must never fail the user's request, but a
 * silent failure would be worse — so we log it.
 */
export const audit = (req: Request, input: AuditInput): void => {
  void prisma.auditLog
    .create({
      data: {
        userId: req.user?.id ?? null,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? null,
        summary: input.summary ?? null,
        ipAddress: req.ip ?? null,
      },
    })
    .catch((err) => console.error("[audit] failed to write audit log:", err));
};

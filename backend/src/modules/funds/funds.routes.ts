import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../lib/async-handler";
import { badRequest } from "../../lib/http-error";
import { audit } from "../../lib/audit";
import { validate } from "../../middleware/validate";
import { requireAuth, requireFinance, requireRole } from "../../middleware/auth";

export const fundsRouter = Router();
fundsRouter.use(requireAuth, requireFinance);

const fundBody = z.object({
  name: z.string().min(1, "Fund name is required"),
  description: z.string().nullish(),
  isActive: z.boolean().default(true),
});

fundsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const funds = await prisma.fund.findMany({ orderBy: { name: "asc" } });

    const totals = await prisma.contribution.groupBy({
      by: ["fundId"],
      _sum: { amount: true },
      _count: true,
    });
    const byFund = new Map(totals.map((t) => [t.fundId, t]));

    res.json({
      data: funds.map((f) => ({
        ...f,
        total: (byFund.get(f.id)?._sum.amount ?? new Prisma.Decimal(0)).toString(),
        contributionCount: byFund.get(f.id)?._count ?? 0,
      })),
    });
  }),
);

fundsRouter.post(
  "/",
  validate(fundBody),
  asyncHandler(async (req, res) => {
    const fund = await prisma.fund.create({ data: req.body as z.infer<typeof fundBody> });
    audit(req, { action: "CREATE", entity: "Fund", entityId: fund.id, summary: fund.name });
    res.status(201).json({ data: fund });
  }),
);

fundsRouter.patch(
  "/:id",
  validate(fundBody.partial()),
  asyncHandler(async (req, res) => {
    const fund = await prisma.fund.update({
      where: { id: req.params.id! },
      data: req.body as Partial<z.infer<typeof fundBody>>,
    });
    audit(req, { action: "UPDATE", entity: "Fund", entityId: fund.id, summary: fund.name });
    res.json({ data: fund });
  }),
);

fundsRouter.delete(
  "/:id",
  requireRole(),
  asyncHandler(async (req, res) => {
    const count = await prisma.contribution.count({ where: { fundId: req.params.id! } });
    if (count > 0) {
      throw badRequest(
        `This fund has ${count} contribution(s) recorded against it. Deactivate it instead of deleting.`,
      );
    }
    await prisma.fund.delete({ where: { id: req.params.id! } });
    audit(req, { action: "DELETE", entity: "Fund", entityId: req.params.id! });
    res.json({ message: "Fund deleted" });
  }),
);

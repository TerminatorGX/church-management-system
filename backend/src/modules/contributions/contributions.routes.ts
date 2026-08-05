import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../lib/async-handler";
import { notFound } from "../../lib/http-error";
import { audit } from "../../lib/audit";
import { validate } from "../../middleware/validate";
import { requireAuth, requireFinance, requireRole } from "../../middleware/auth";
import { paginated, paginationSchema, toSkipTake } from "../../lib/pagination";
import { toCsv } from "../../lib/csv";
import { nextReceiptNumber } from "./receipt";

export const contributionsRouter = Router();

/**
 * The whole ledger is finance-only. The proposal's role model puts giving data
 * behind the finance role, and member-level giving is the most sensitive data
 * in the system.
 */
contributionsRouter.use(requireAuth, requireFinance);

const methods = ["CASH", "BANK_TRANSFER", "MOBILE_MONEY", "CHEQUE", "IN_KIND"] as const;

const contributionBody = z.object({
  amount: z.coerce
    .number()
    .positive("Amount must be greater than zero")
    .max(99_999_999.99, "Amount is too large")
    // Money arrives as a number from JSON but must reach Postgres as a
    // fixed-precision decimal, so normalise to 2dp here.
    .transform((n) => new Prisma.Decimal(n.toFixed(2))),
  currency: z.string().length(3).default("ZMW"),
  receivedOn: z.coerce.date(),
  paymentMethod: z.enum(methods).default("CASH"),
  fundId: z.string().uuid(),
  memberId: z.string().uuid().nullish(),
  notes: z.string().nullish(),
});

const listQuery = paginationSchema.extend({
  fundId: z.string().uuid().optional(),
  memberId: z.string().uuid().optional(),
  paymentMethod: z.enum(methods).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  search: z.string().trim().optional(),
});

const buildWhere = (q: z.infer<typeof listQuery>): Prisma.ContributionWhereInput => ({
  ...(q.fundId ? { fundId: q.fundId } : {}),
  ...(q.memberId ? { memberId: q.memberId } : {}),
  ...(q.paymentMethod ? { paymentMethod: q.paymentMethod } : {}),
  ...(q.from || q.to
    ? { receivedOn: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lte: q.to } : {}) } }
    : {}),
  ...(q.search
    ? {
        OR: [
          { receiptNumber: { contains: q.search, mode: "insensitive" } },
          { notes: { contains: q.search, mode: "insensitive" } },
          { member: { firstName: { contains: q.search, mode: "insensitive" } } },
          { member: { lastName: { contains: q.search, mode: "insensitive" } } },
        ],
      }
    : {}),
});

contributionsRouter.get(
  "/",
  validate(listQuery, "query"),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as z.infer<typeof listQuery>;
    const where = buildWhere(q);

    const [data, total, sum] = await Promise.all([
      prisma.contribution.findMany({
        where,
        ...toSkipTake(q),
        orderBy: [{ receivedOn: "desc" }, { createdAt: "desc" }],
        include: {
          fund: { select: { id: true, name: true } },
          member: { select: { id: true, firstName: true, lastName: true } },
          recordedBy: { select: { id: true, name: true } },
        },
      }),
      prisma.contribution.count({ where }),
      prisma.contribution.aggregate({ where, _sum: { amount: true } }),
    ]);

    res.json({
      ...paginated(data, total, q),
      // Total across the whole filtered set, not just this page.
      totals: { amount: (sum._sum.amount ?? new Prisma.Decimal(0)).toString() },
    });
  }),
);

contributionsRouter.get(
  "/export",
  validate(listQuery.omit({ page: true, pageSize: true }), "query"),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as z.infer<typeof listQuery>;
    const rows = await prisma.contribution.findMany({
      where: buildWhere(q),
      orderBy: [{ receivedOn: "desc" }],
      include: { fund: true, member: true, recordedBy: true },
    });

    const csv = toCsv(rows, [
      ["Receipt", (r) => r.receiptNumber],
      ["Date", (r) => r.receivedOn.toISOString().slice(0, 10)],
      ["Contributor", (r) => (r.member ? `${r.member.firstName} ${r.member.lastName}` : "Anonymous")],
      ["Fund", (r) => r.fund.name],
      ["Amount", (r) => r.amount.toString()],
      ["Currency", (r) => r.currency],
      ["Method", (r) => r.paymentMethod],
      ["Recorded by", (r) => r.recordedBy?.name],
      ["Notes", (r) => r.notes],
    ]);

    audit(req, { action: "EXPORT", entity: "Contribution", summary: `Exported ${rows.length} contributions` });
    res.header("Content-Type", "text/csv; charset=utf-8");
    res.attachment(`contributions-${new Date().toISOString().slice(0, 10)}.csv`);
    res.send(csv);
  }),
);

/** Per-member giving statement for a period. */
contributionsRouter.get(
  "/statement/:memberId",
  validate(z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional() }), "query"),
  asyncHandler(async (req, res) => {
    const { from, to } = req.query as unknown as { from?: Date; to?: Date };
    const memberId = req.params.memberId!;

    const member = await prisma.member.findUnique({
      where: { id: memberId },
      select: { id: true, firstName: true, lastName: true, email: true, address: true, city: true },
    });
    if (!member) throw notFound("Member not found");

    const where: Prisma.ContributionWhereInput = {
      memberId,
      ...(from || to ? { receivedOn: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    };

    const [lines, byFund, total] = await Promise.all([
      prisma.contribution.findMany({
        where,
        orderBy: { receivedOn: "asc" },
        include: { fund: { select: { name: true } } },
      }),
      prisma.contribution.groupBy({ by: ["fundId"], where, _sum: { amount: true } }),
      prisma.contribution.aggregate({ where, _sum: { amount: true } }),
    ]);

    const fundNames = await prisma.fund.findMany({
      where: { id: { in: byFund.map((f) => f.fundId) } },
      select: { id: true, name: true },
    });
    const nameOf = new Map(fundNames.map((f) => [f.id, f.name]));

    res.json({
      data: {
        member,
        period: { from: from ?? null, to: to ?? null },
        lines,
        byFund: byFund.map((f) => ({
          fund: nameOf.get(f.fundId) ?? "Unknown",
          amount: (f._sum.amount ?? new Prisma.Decimal(0)).toString(),
        })),
        total: (total._sum.amount ?? new Prisma.Decimal(0)).toString(),
      },
    });
  }),
);

contributionsRouter.post(
  "/",
  validate(contributionBody),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof contributionBody>;

    const contribution = await prisma.contribution.create({
      data: {
        ...body,
        memberId: body.memberId ?? null,
        receiptNumber: await nextReceiptNumber(body.receivedOn),
        recordedById: req.user!.id,
      },
      include: {
        fund: { select: { id: true, name: true } },
        member: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    audit(req, {
      action: "CREATE",
      entity: "Contribution",
      entityId: contribution.id,
      summary: `${contribution.receiptNumber}: ${contribution.currency} ${contribution.amount} to ${contribution.fund.name}`,
    });

    res.status(201).json({ data: contribution });
  }),
);

/**
 * Corrections are allowed but the receipt number is immutable — a ledger where
 * receipt numbers can be reassigned is not auditable.
 */
contributionsRouter.patch(
  "/:id",
  validate(contributionBody.partial()),
  asyncHandler(async (req, res) => {
    const contribution = await prisma.contribution.update({
      where: { id: req.params.id! },
      data: req.body as Partial<z.infer<typeof contributionBody>>,
      include: { fund: { select: { name: true } } },
    });
    audit(req, {
      action: "UPDATE",
      entity: "Contribution",
      entityId: contribution.id,
      summary: `Corrected ${contribution.receiptNumber}`,
    });
    res.json({ data: contribution });
  }),
);

contributionsRouter.delete(
  "/:id",
  requireRole(),
  asyncHandler(async (req, res) => {
    const contribution = await prisma.contribution.delete({ where: { id: req.params.id! } });
    audit(req, {
      action: "DELETE",
      entity: "Contribution",
      entityId: contribution.id,
      summary: `Voided ${contribution.receiptNumber} (${contribution.amount})`,
    });
    res.json({ message: `Receipt ${contribution.receiptNumber} voided` });
  }),
);

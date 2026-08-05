import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../lib/async-handler";
import { validate } from "../../middleware/validate";
import { requireAuth } from "../../middleware/auth";

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth);

const monthsAgo = (n: number) => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCMonth(d.getUTCMonth() - n, 1);
  return d;
};

const rangeQuery = z.object({
  months: z.coerce.number().int().min(1).max(24).default(6),
});

/** Headline tiles. Finance figures are omitted for roles that may not see them. */
dashboardRouter.get(
  "/summary",
  asyncHandler(async (req, res) => {
    const canSeeFinance = req.user!.role === "ADMIN" || req.user!.role === "FINANCE";
    const startOfMonth = monthsAgo(0);
    const startOfPrevMonth = monthsAgo(1);
    const now = new Date();

    const [
      activeMembers,
      totalFamilies,
      newThisMonth,
      upcomingEvents,
      pendingAssignments,
      lastService,
    ] = await Promise.all([
      prisma.member.count({ where: { isActive: true } }),
      prisma.family.count(),
      prisma.member.count({ where: { isActive: true, createdAt: { gte: startOfMonth } } }),
      prisma.event.count({ where: { startsAt: { gte: now } } }),
      prisma.volunteerAssignment.count({
        where: { status: "PENDING", event: { startsAt: { gte: now } } },
      }),
      prisma.event.findFirst({
        where: { startsAt: { lte: now }, type: { in: ["SUNDAY_SERVICE", "MIDWEEK_SERVICE"] } },
        orderBy: { startsAt: "desc" },
        select: {
          id: true,
          name: true,
          startsAt: true,
          _count: { select: { attendances: { where: { status: { in: ["PRESENT", "LATE"] } } } } },
        },
      }),
    ]);

    let finance = null;
    if (canSeeFinance) {
      const [thisMonth, prevMonth] = await Promise.all([
        prisma.contribution.aggregate({
          where: { receivedOn: { gte: startOfMonth } },
          _sum: { amount: true },
          _count: true,
        }),
        prisma.contribution.aggregate({
          where: { receivedOn: { gte: startOfPrevMonth, lt: startOfMonth } },
          _sum: { amount: true },
        }),
      ]);

      const current = thisMonth._sum.amount ?? new Prisma.Decimal(0);
      const previous = prevMonth._sum.amount ?? new Prisma.Decimal(0);

      finance = {
        thisMonth: current.toString(),
        previousMonth: previous.toString(),
        contributionCount: thisMonth._count,
        changePercent: previous.isZero()
          ? null
          : Math.round(current.minus(previous).div(previous).toNumber() * 100),
      };
    }

    res.json({
      data: {
        activeMembers,
        totalFamilies,
        newThisMonth,
        upcomingEvents,
        pendingAssignments,
        lastService: lastService
          ? { id: lastService.id, name: lastService.name, startsAt: lastService.startsAt, attendance: lastService._count.attendances }
          : null,
        finance,
      },
    });
  }),
);

/** Attendance per service over time — the primary trend chart. */
dashboardRouter.get(
  "/attendance-trend",
  validate(rangeQuery, "query"),
  asyncHandler(async (req, res) => {
    const { months } = req.query as unknown as z.infer<typeof rangeQuery>;

    const events = await prisma.event.findMany({
      where: {
        startsAt: { gte: monthsAgo(months - 1), lte: new Date() },
        type: { in: ["SUNDAY_SERVICE", "MIDWEEK_SERVICE"] },
      },
      orderBy: { startsAt: "asc" },
      select: {
        id: true,
        name: true,
        type: true,
        startsAt: true,
        _count: { select: { attendances: { where: { status: { in: ["PRESENT", "LATE"] } } } } },
      },
    });

    res.json({
      data: events.map((e) => ({
        eventId: e.id,
        label: e.startsAt.toISOString().slice(0, 10),
        name: e.name,
        type: e.type,
        attendance: e._count.attendances,
      })),
    });
  }),
);

/** Contributions grouped by month and fund — stacked bar chart. */
dashboardRouter.get(
  "/giving-trend",
  validate(rangeQuery, "query"),
  asyncHandler(async (req, res) => {
    if (req.user!.role !== "ADMIN" && req.user!.role !== "FINANCE") {
      return res.json({ data: [], funds: [], restricted: true });
    }

    const { months } = req.query as unknown as z.infer<typeof rangeQuery>;
    const since = monthsAgo(months - 1);

    // groupBy cannot bucket by month, so aggregate the raw rows in SQL.
    const rows = await prisma.$queryRaw<{ month: Date; fund: string; total: Prisma.Decimal }[]>`
      SELECT date_trunc('month', c."receivedOn")::date AS month,
             f."name"                                  AS fund,
             SUM(c."amount")                           AS total
      FROM "Contribution" c
      JOIN "Fund" f ON f."id" = c."fundId"
      WHERE c."receivedOn" >= ${since}
      GROUP BY 1, 2
      ORDER BY 1 ASC
    `;

    const funds = [...new Set(rows.map((r) => r.fund))].sort();
    const byMonth = new Map<string, Record<string, number | string>>();

    for (const row of rows) {
      const key = row.month.toISOString().slice(0, 7);
      if (!byMonth.has(key)) byMonth.set(key, { month: key });
      byMonth.get(key)![row.fund] = Number(row.total);
    }

    // Fill gaps so the chart has a continuous axis even in quiet months.
    const data: Record<string, number | string>[] = [];
    for (let i = months - 1; i >= 0; i--) {
      const key = monthsAgo(i).toISOString().slice(0, 7);
      const bucket = byMonth.get(key) ?? { month: key };
      for (const f of funds) if (!(f in bucket)) bucket[f] = 0;
      data.push(bucket);
    }

    res.json({ data, funds });
  }),
);

/** Share of giving by fund for the period — pie chart. */
dashboardRouter.get(
  "/giving-by-fund",
  validate(rangeQuery, "query"),
  asyncHandler(async (req, res) => {
    if (req.user!.role !== "ADMIN" && req.user!.role !== "FINANCE") {
      return res.json({ data: [], restricted: true });
    }

    const { months } = req.query as unknown as z.infer<typeof rangeQuery>;
    const grouped = await prisma.contribution.groupBy({
      by: ["fundId"],
      where: { receivedOn: { gte: monthsAgo(months - 1) } },
      _sum: { amount: true },
      _count: true,
    });

    const funds = await prisma.fund.findMany({
      where: { id: { in: grouped.map((g) => g.fundId) } },
      select: { id: true, name: true },
    });
    const nameOf = new Map(funds.map((f) => [f.id, f.name]));

    res.json({
      data: grouped
        .map((g) => ({
          fund: nameOf.get(g.fundId) ?? "Unknown",
          amount: Number(g._sum.amount ?? 0),
          count: g._count,
        }))
        .sort((a, b) => b.amount - a.amount),
    });
  }),
);

/** Membership growth: cumulative active members by month. */
dashboardRouter.get(
  "/membership-growth",
  validate(rangeQuery, "query"),
  asyncHandler(async (req, res) => {
    const { months } = req.query as unknown as z.infer<typeof rangeQuery>;
    const since = monthsAgo(months - 1);

    const [joinedByMonth, baseline] = await Promise.all([
      prisma.$queryRaw<{ month: Date; count: bigint }[]>`
        SELECT date_trunc('month', COALESCE(m."joinedDate", m."createdAt"))::date AS month,
               COUNT(*) AS count
        FROM "Member" m
        WHERE COALESCE(m."joinedDate", m."createdAt") >= ${since}
        GROUP BY 1
        ORDER BY 1 ASC
      `,
      prisma.member.count({
        where: { OR: [{ joinedDate: { lt: since } }, { joinedDate: null, createdAt: { lt: since } }] },
      }),
    ]);

    const joined = new Map(joinedByMonth.map((r) => [r.month.toISOString().slice(0, 7), Number(r.count)]));

    let running = baseline;
    const data = [];
    for (let i = months - 1; i >= 0; i--) {
      const key = monthsAgo(i).toISOString().slice(0, 7);
      const newMembers = joined.get(key) ?? 0;
      running += newMembers;
      data.push({ month: key, newMembers, totalMembers: running });
    }

    res.json({ data });
  }),
);

/** Volunteer coverage for upcoming events — how many slots are still pending. */
dashboardRouter.get(
  "/volunteer-coverage",
  asyncHandler(async (_req, res) => {
    const events = await prisma.event.findMany({
      where: { startsAt: { gte: new Date() } },
      orderBy: { startsAt: "asc" },
      take: 8,
      select: {
        id: true,
        name: true,
        startsAt: true,
        assignments: { select: { status: true } },
      },
    });

    res.json({
      data: events.map((e) => ({
        eventId: e.id,
        name: e.name,
        startsAt: e.startsAt,
        confirmed: e.assignments.filter((a) => a.status === "CONFIRMED").length,
        pending: e.assignments.filter((a) => a.status === "PENDING").length,
        declined: e.assignments.filter((a) => a.status === "DECLINED").length,
      })),
    });
  }),
);

/**
 * Members who have not attended anything recently. The proposal calls this
 * "identification of inactive members for follow-up".
 */
dashboardRouter.get(
  "/needs-follow-up",
  asyncHandler(async (_req, res) => {
    const cutoff = monthsAgo(2);

    const members = await prisma.member.findMany({
      where: {
        isActive: true,
        attendances: { none: { event: { startsAt: { gte: cutoff } }, status: { in: ["PRESENT", "LATE"] } } },
      },
      take: 25,
      orderBy: [{ lastName: "asc" }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        email: true,
        attendances: {
          where: { status: { in: ["PRESENT", "LATE"] } },
          orderBy: { event: { startsAt: "desc" } },
          take: 1,
          select: { event: { select: { startsAt: true, name: true } } },
        },
      },
    });

    res.json({
      data: members.map((m) => ({
        id: m.id,
        firstName: m.firstName,
        lastName: m.lastName,
        phone: m.phone,
        email: m.email,
        lastSeen: m.attendances[0]?.event.startsAt ?? null,
      })),
      since: cutoff,
    });
  }),
);

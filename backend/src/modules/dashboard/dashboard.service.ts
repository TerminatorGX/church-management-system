import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";

/**
 * The actual dashboard queries, factored out of the route handlers so the
 * PDF report endpoint can build the exact same datasets the charts show,
 * without duplicating any Prisma logic.
 */

export const monthsAgo = (n: number) => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCMonth(d.getUTCMonth() - n, 1);
  return d;
};

export const getSummary = async (canSeeFinance: boolean) => {
  const startOfMonth = monthsAgo(0);
  const startOfPrevMonth = monthsAgo(1);
  const now = new Date();

  const [activeMembers, totalFamilies, newThisMonth, upcomingEvents, pendingAssignments, lastService] =
    await Promise.all([
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

  return {
    activeMembers,
    totalFamilies,
    newThisMonth,
    upcomingEvents,
    pendingAssignments,
    lastService: lastService
      ? {
          id: lastService.id,
          name: lastService.name,
          startsAt: lastService.startsAt,
          attendance: lastService._count.attendances,
        }
      : null,
    finance,
  };
};

export const getAttendanceTrend = async (months: number) => {
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

  return events.map((e) => ({
    eventId: e.id,
    label: e.startsAt.toISOString().slice(0, 10),
    name: e.name,
    type: e.type,
    attendance: e._count.attendances,
  }));
};

export const getGivingTrend = async (months: number, canSeeFinance: boolean) => {
  if (!canSeeFinance) return { data: [] as Record<string, number | string>[], funds: [] as string[], restricted: true };

  const since = monthsAgo(months - 1);

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

  const data: Record<string, number | string>[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const key = monthsAgo(i).toISOString().slice(0, 7);
    const bucket = byMonth.get(key) ?? { month: key };
    for (const f of funds) if (!(f in bucket)) bucket[f] = 0;
    data.push(bucket);
  }

  return { data, funds, restricted: false };
};

export const getGivingByFund = async (months: number, canSeeFinance: boolean) => {
  if (!canSeeFinance) return { data: [] as { fund: string; amount: number; count: number }[], restricted: true };

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

  const data = grouped
    .map((g) => ({
      fund: nameOf.get(g.fundId) ?? "Unknown",
      amount: Number(g._sum.amount ?? 0),
      count: g._count,
    }))
    .sort((a, b) => b.amount - a.amount);

  return { data, restricted: false };
};

export const getMembershipGrowth = async (months: number) => {
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

  return data;
};

export const getVolunteerCoverage = async () => {
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

  return events.map((e) => ({
    eventId: e.id,
    name: e.name,
    startsAt: e.startsAt,
    confirmed: e.assignments.filter((a) => a.status === "CONFIRMED").length,
    pending: e.assignments.filter((a) => a.status === "PENDING").length,
    declined: e.assignments.filter((a) => a.status === "DECLINED").length,
  }));
};

export const getNeedsFollowUp = async () => {
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

  return {
    data: members.map((m) => ({
      id: m.id,
      firstName: m.firstName,
      lastName: m.lastName,
      phone: m.phone,
      email: m.email,
      lastSeen: m.attendances[0]?.event.startsAt ?? null,
    })),
    since: cutoff,
  };
};

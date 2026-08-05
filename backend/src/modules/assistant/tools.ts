import { Prisma } from "@prisma/client";
import type Anthropic from "@anthropic-ai/sdk";
import { prisma } from "../../lib/prisma";
import type { AuthedUser } from "../../middleware/auth";

/**
 * Read-only query tools the assistant can call. Every tool re-checks the
 * caller's role: the assistant runs with the permissions of whoever is asking,
 * so a DEPT_HEAD cannot get at giving data by asking nicely.
 */

const canSeeFinance = (user: AuthedUser) => user.role === "ADMIN" || user.role === "FINANCE";

export const toolDefinitions: Anthropic.Tool[] = [
  {
    name: "search_members",
    description:
      "Search the member directory by name, phone, email, skill, or department. " +
      "Call this when the user asks who someone is, who has a particular skill, " +
      "or wants a list of people matching a description.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Name, partial name, phone, or email" },
        skill: { type: "string", description: "Filter to members who list this skill" },
        departmentName: { type: "string", description: "Filter to members of this department" },
        includeInactive: { type: "boolean", description: "Include archived members (default false)" },
        limit: { type: "integer", description: "Max results, 1-50 (default 20)" },
      },
    },
  },
  {
    name: "get_attendance_summary",
    description:
      "Attendance figures per service over a recent period, plus the overall average. " +
      "Call this for questions about attendance trends, how many came on a given Sunday, " +
      "or whether attendance is rising or falling.",
    input_schema: {
      type: "object",
      properties: {
        months: { type: "integer", description: "How many months back to look, 1-24 (default 3)" },
      },
    },
  },
  {
    name: "get_giving_summary",
    description:
      "Contribution totals by fund and by month. FINANCE and ADMIN only — the tool " +
      "returns an error for other roles. Call this for questions about giving, offerings, " +
      "tithes, or fund balances.",
    input_schema: {
      type: "object",
      properties: {
        months: { type: "integer", description: "How many months back to look, 1-24 (default 3)" },
        fundName: { type: "string", description: "Restrict to a single fund" },
      },
    },
  },
  {
    name: "get_upcoming_schedule",
    description:
      "Upcoming events with their volunteer assignments and how many slots are still pending. " +
      "Call this for questions about what is coming up, who is serving, or which rotas are short.",
    input_schema: {
      type: "object",
      properties: {
        limit: { type: "integer", description: "Max events, 1-20 (default 5)" },
      },
    },
  },
  {
    name: "find_members_needing_follow_up",
    description:
      "Active members with no recorded attendance in the last N months — the pastoral " +
      "follow-up list. Call this when the user asks who has stopped coming or who needs " +
      "a visit or a call.",
    input_schema: {
      type: "object",
      properties: {
        months: { type: "integer", description: "Absence window in months, 1-12 (default 2)" },
        limit: { type: "integer", description: "Max results, 1-50 (default 20)" },
      },
    },
  },
  {
    name: "get_church_overview",
    description:
      "Headline counts: active members, families, departments, upcoming events. " +
      "Call this for broad 'how are we doing' questions or when you need orientation " +
      "before answering something more specific.",
    input_schema: { type: "object", properties: {} },
  },
];

const monthsAgo = (n: number) => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCMonth(d.getUTCMonth() - n, 1);
  return d;
};

const clamp = (v: unknown, min: number, max: number, fallback: number) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.trunc(n))) : fallback;
};

type ToolInput = Record<string, unknown>;

export const runTool = async (
  name: string,
  input: ToolInput,
  user: AuthedUser,
): Promise<unknown> => {
  switch (name) {
    case "search_members": {
      const q = typeof input.query === "string" ? input.query.trim() : "";
      const members = await prisma.member.findMany({
        where: {
          ...(input.includeInactive ? {} : { isActive: true }),
          ...(typeof input.skill === "string" && input.skill
            ? { skills: { has: input.skill } }
            : {}),
          ...(typeof input.departmentName === "string" && input.departmentName
            ? {
                departmentMemberships: {
                  some: {
                    isActive: true,
                    department: { name: { equals: input.departmentName, mode: "insensitive" } },
                  },
                },
              }
            : {}),
          ...(q
            ? {
                OR: [
                  { firstName: { contains: q, mode: "insensitive" } },
                  { lastName: { contains: q, mode: "insensitive" } },
                  { email: { contains: q, mode: "insensitive" } },
                  { phone: { contains: q } },
                ],
              }
            : {}),
        },
        take: clamp(input.limit, 1, 50, 20),
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          email: true,
          skills: true,
          isActive: true,
          family: { select: { familyName: true } },
          departmentMemberships: {
            where: { isActive: true },
            select: { department: { select: { name: true } } },
          },
        },
      });

      return {
        count: members.length,
        members: members.map((m) => ({
          id: m.id,
          name: `${m.firstName} ${m.lastName}`,
          phone: m.phone,
          email: m.email,
          family: m.family?.familyName ?? null,
          skills: m.skills,
          departments: m.departmentMemberships.map((d) => d.department.name),
          active: m.isActive,
        })),
      };
    }

    case "get_attendance_summary": {
      const months = clamp(input.months, 1, 24, 3);
      const events = await prisma.event.findMany({
        where: {
          startsAt: { gte: monthsAgo(months - 1), lte: new Date() },
          type: { in: ["SUNDAY_SERVICE", "MIDWEEK_SERVICE"] },
        },
        orderBy: { startsAt: "asc" },
        select: {
          name: true,
          type: true,
          startsAt: true,
          _count: { select: { attendances: { where: { status: { in: ["PRESENT", "LATE"] } } } } },
        },
      });

      const counts = events.map((e) => e._count.attendances);
      const average = counts.length
        ? Math.round(counts.reduce((a, b) => a + b, 0) / counts.length)
        : 0;

      return {
        periodMonths: months,
        serviceCount: events.length,
        averageAttendance: average,
        highest: counts.length ? Math.max(...counts) : 0,
        lowest: counts.length ? Math.min(...counts) : 0,
        services: events.map((e) => ({
          date: e.startsAt.toISOString().slice(0, 10),
          name: e.name,
          type: e.type,
          attendance: e._count.attendances,
        })),
      };
    }

    case "get_giving_summary": {
      if (!canSeeFinance(user)) {
        return {
          error:
            "Access denied. Contribution data is restricted to the ADMIN and FINANCE roles. " +
            "Tell the user their role does not permit viewing giving data.",
        };
      }

      const months = clamp(input.months, 1, 24, 3);
      const since = monthsAgo(months - 1);
      const where: Prisma.ContributionWhereInput = {
        receivedOn: { gte: since },
        ...(typeof input.fundName === "string" && input.fundName
          ? { fund: { name: { equals: input.fundName, mode: "insensitive" } } }
          : {}),
      };

      const [total, byFund, byMonth] = await Promise.all([
        prisma.contribution.aggregate({ where, _sum: { amount: true }, _count: true }),
        prisma.contribution.groupBy({ by: ["fundId"], where, _sum: { amount: true }, _count: true }),
        prisma.$queryRaw<{ month: Date; total: Prisma.Decimal }[]>`
          SELECT date_trunc('month', c."receivedOn")::date AS month, SUM(c."amount") AS total
          FROM "Contribution" c
          WHERE c."receivedOn" >= ${since}
          GROUP BY 1 ORDER BY 1 ASC
        `,
      ]);

      const funds = await prisma.fund.findMany({
        where: { id: { in: byFund.map((f) => f.fundId) } },
        select: { id: true, name: true },
      });
      const nameOf = new Map(funds.map((f) => [f.id, f.name]));

      return {
        periodMonths: months,
        currency: "ZMW",
        total: (total._sum.amount ?? new Prisma.Decimal(0)).toString(),
        contributionCount: total._count,
        byFund: byFund.map((f) => ({
          fund: nameOf.get(f.fundId) ?? "Unknown",
          total: (f._sum.amount ?? new Prisma.Decimal(0)).toString(),
          count: f._count,
        })),
        byMonth: byMonth.map((m) => ({
          month: m.month.toISOString().slice(0, 7),
          total: m.total.toString(),
        })),
      };
    }

    case "get_upcoming_schedule": {
      const events = await prisma.event.findMany({
        where: { startsAt: { gte: new Date() } },
        orderBy: { startsAt: "asc" },
        take: clamp(input.limit, 1, 20, 5),
        select: {
          name: true,
          type: true,
          startsAt: true,
          location: true,
          assignments: {
            select: {
              status: true,
              role: { select: { name: true } },
              member: { select: { firstName: true, lastName: true } },
            },
          },
        },
      });

      return {
        events: events.map((e) => ({
          name: e.name,
          type: e.type,
          startsAt: e.startsAt.toISOString(),
          location: e.location,
          volunteers: e.assignments.map((a) => ({
            name: `${a.member.firstName} ${a.member.lastName}`,
            role: a.role.name,
            status: a.status,
          })),
          pendingCount: e.assignments.filter((a) => a.status === "PENDING").length,
        })),
      };
    }

    case "find_members_needing_follow_up": {
      const months = clamp(input.months, 1, 12, 2);
      const cutoff = monthsAgo(months);

      const members = await prisma.member.findMany({
        where: {
          isActive: true,
          attendances: {
            none: { status: { in: ["PRESENT", "LATE"] }, event: { startsAt: { gte: cutoff } } },
          },
        },
        take: clamp(input.limit, 1, 50, 20),
        orderBy: [{ lastName: "asc" }],
        select: {
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
        absenceWindowMonths: months,
        count: members.length,
        members: members.map((m) => ({
          name: `${m.firstName} ${m.lastName}`,
          phone: m.phone,
          email: m.email,
          lastSeen: m.attendances[0]?.event.startsAt.toISOString().slice(0, 10) ?? "never recorded",
        })),
      };
    }

    case "get_church_overview": {
      const [activeMembers, families, departments, upcomingEvents, newThisMonth] =
        await Promise.all([
          prisma.member.count({ where: { isActive: true } }),
          prisma.family.count(),
          prisma.department.count({ where: { isActive: true } }),
          prisma.event.count({ where: { startsAt: { gte: new Date() } } }),
          prisma.member.count({ where: { isActive: true, createdAt: { gte: monthsAgo(0) } } }),
        ]);

      return { activeMembers, families, departments, upcomingEvents, newMembersThisMonth: newThisMonth };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
};

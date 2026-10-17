import { Prisma } from "@prisma/client";
import type { ChatCompletionTool } from "groq-sdk/resources/chat/completions";
import { prisma } from "../../lib/prisma";
import { ageOn } from "../../lib/dates";
import type { AuthedUser } from "../../middleware/auth";

/**
 * Read-only query tools the assistant can call. Every tool re-checks the
 * caller's role: the assistant runs with the permissions of whoever is asking,
 * so a DEPT_HEAD cannot get at giving data by asking nicely.
 */

const canSeeFinance = (user: AuthedUser) => user.role === "ADMIN" || user.role === "FINANCE";

export const toolDefinitions: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "search_members",
      description:
        "Search the member directory by name, phone, email, skill, or department. " +
        "Call this when the user asks who someone is, who has a particular skill, " +
        "or wants a list of people matching a description.",
      parameters: {
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
  },
  {
    type: "function",
    function: {
      name: "get_attendance_summary",
      description:
        "Attendance figures per service over a recent period, plus the overall average. " +
        "Call this for questions about attendance trends, how many came on a given Sunday, " +
        "or whether attendance is rising or falling.",
      parameters: {
        type: "object",
        properties: {
          months: { type: "integer", description: "How many months back to look, 1-24 (default 3)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_giving_summary",
      description:
        "Contribution totals by fund and by month. FINANCE and ADMIN only — the tool " +
        "returns an error for other roles. Call this for questions about giving, offerings, " +
        "tithes, or fund balances.",
      parameters: {
        type: "object",
        properties: {
          months: { type: "integer", description: "How many months back to look, 1-24 (default 3)" },
          fundName: { type: "string", description: "Restrict to a single fund" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_upcoming_schedule",
      description:
        "Upcoming events with their volunteer assignments and how many slots are still pending. " +
        "Call this for questions about what is coming up, who is serving, or which rotas are short.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "integer", description: "Max events, 1-20 (default 5)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "find_members_needing_follow_up",
      description:
        "Active members with no recorded attendance in the last N months — the pastoral " +
        "follow-up list. Call this when the user asks who has stopped coming or who needs " +
        "a visit or a call.",
      parameters: {
        type: "object",
        properties: {
          months: { type: "integer", description: "Absence window in months, 1-12 (default 2)" },
          limit: { type: "integer", description: "Max results, 1-50 (default 20)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_church_overview",
      description:
        "Headline counts: active members, families, departments, upcoming events. " +
        "Call this for broad 'how are we doing' questions or when you need orientation " +
        "before answering something more specific.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_fund_details",
      description:
        "Funds with their description, active status, and total given to each over a " +
        "period (up to 5 years back). FINANCE and ADMIN only. Call this for questions " +
        "about what funds exist, a specific fund's total, or a fund's description.",
      parameters: {
        type: "object",
        properties: {
          months: { type: "integer", description: "How many months back to total, 1-60 (default 12)" },
          fundName: { type: "string", description: "Restrict to a single fund by name" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_member_profile",
      description:
        "One specific member's full profile: contact details, age, safeguarding clearance " +
        "status, family, departments, attendance rate and recent volunteering over a period " +
        "(giving totals included only for FINANCE/ADMIN callers). Call this when the user " +
        "asks about one named person in depth, not a list of people — including whether " +
        "they're eligible for a volunteer role (combine with list_volunteer_roles).",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Name, phone, or email to find the member" },
          months: { type: "integer", description: "How many months back for attendance/giving, 1-24 (default 6)" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_families",
      description:
        "Find a household by family name and list its members and contact details. " +
        "Call this when the user asks about a specific family.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Family name or partial name" },
          limit: { type: "integer", description: "Max families, 1-20 (default 5)" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_department_roster",
      description:
        "A department/ministry's leader and active members with their role titles. " +
        "Call this for questions about who's in a team or who leads it.",
      parameters: {
        type: "object",
        properties: {
          departmentName: { type: "string", description: "Department/ministry name" },
        },
        required: ["departmentName"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_past_events",
      description:
        "Recently held events (not upcoming), with attendance and volunteer counts, " +
        "up to 12 months back. Call this for questions about what happened at a past " +
        "service or event.",
      parameters: {
        type: "object",
        properties: {
          months: { type: "integer", description: "How many months back to look, 1-12 (default 3)" },
          eventType: {
            type: "string",
            description:
              "Filter by type: SUNDAY_SERVICE, MIDWEEK_SERVICE, SMALL_GROUP, SPECIAL_EVENT, OUTREACH, CONFERENCE",
          },
          limit: { type: "integer", description: "Max events, 1-30 (default 10)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_volunteer_roles",
      description:
        "Every volunteer role/ministry slot (Usher, Children's teacher, ...), with its " +
        "description and any safeguarding requirements — a minimum age, a required background " +
        "check / clearance, both, or neither. Call this for questions about what volunteer " +
        "roles exist, which roles need clearance or have an age minimum, or who can serve " +
        "where (combine with get_member_profile for a specific person's eligibility).",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_recent_activity",
      description:
        "Recent audit log entries — who created, updated, deleted, exported, or logged in, and " +
        "when. ADMIN only — the tool returns an error for other roles. Call this for questions " +
        "about recent changes, who did something, or general 'what's been happening' questions " +
        "from an admin.",
      parameters: {
        type: "object",
        properties: {
          entity: {
            type: "string",
            description: "Restrict to one kind of record, e.g. Member, Contribution, Event, Fund",
          },
          limit: { type: "integer", description: "Max entries, 1-50 (default 15)" },
        },
      },
    },
  },
];

const eventTypes = [
  "SUNDAY_SERVICE",
  "MIDWEEK_SERVICE",
  "SMALL_GROUP",
  "SPECIAL_EVENT",
  "OUTREACH",
  "CONFERENCE",
] as const;

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

/**
 * A plain `contains` on firstName/lastName misses "Chintu Lungu" entirely,
 * since neither field alone contains the full two-word query. For a
 * multi-word query, also require every word to match firstName OR lastName
 * (in either order), on top of the plain single-field contains checks.
 */
const nameSearchFilter = (q: string): Prisma.MemberWhereInput["OR"] => {
  const fields: Prisma.MemberWhereInput[] = [
    { firstName: { contains: q, mode: "insensitive" } },
    { lastName: { contains: q, mode: "insensitive" } },
    { email: { contains: q, mode: "insensitive" } },
    { phone: { contains: q } },
  ];
  const words = q.split(/\s+/).filter(Boolean);
  if (words.length > 1) {
    fields.push({
      AND: words.map((w) => ({
        OR: [
          { firstName: { contains: w, mode: "insensitive" } },
          { lastName: { contains: w, mode: "insensitive" } },
        ],
      })),
    });
  }
  return fields;
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
                    department: { name: { contains: input.departmentName, mode: "insensitive" } },
                  },
                },
              }
            : {}),
          ...(q ? { OR: nameSearchFilter(q) } : {}),
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
          ? { fund: { name: { contains: input.fundName, mode: "insensitive" } } }
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
          capacity: true,
          _count: { select: { attendances: true } },
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
          // Null unless this specific event has a capacity set (mainly
          // special events/conferences, not recurring services).
          capacity: e.capacity,
          registeredCount: e.capacity != null ? e._count.attendances : undefined,
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

    case "get_fund_details": {
      if (!canSeeFinance(user)) {
        return {
          error:
            "Access denied. Fund data is restricted to the ADMIN and FINANCE roles. " +
            "Tell the user their role does not permit viewing fund information.",
        };
      }

      const months = clamp(input.months, 1, 60, 12);
      const since = monthsAgo(months - 1);

      const funds = await prisma.fund.findMany({
        where:
          typeof input.fundName === "string" && input.fundName
            ? { name: { contains: input.fundName, mode: "insensitive" } }
            : undefined,
        orderBy: { name: "asc" },
        select: {
          name: true,
          description: true,
          isActive: true,
          contributions: { where: { receivedOn: { gte: since } }, select: { amount: true } },
        },
      });

      return {
        periodMonths: months,
        currency: "ZMW",
        funds: funds.map((f) => ({
          name: f.name,
          description: f.description,
          active: f.isActive,
          totalInPeriod: f.contributions
            .reduce((sum, c) => sum.plus(c.amount), new Prisma.Decimal(0))
            .toString(),
          contributionCount: f.contributions.length,
        })),
      };
    }

    case "get_member_profile": {
      const q = typeof input.query === "string" ? input.query.trim() : "";
      if (!q) return { error: "A name, phone, or email is required." };

      const months = clamp(input.months, 1, 24, 6);
      const since = monthsAgo(months - 1);

      const member = await prisma.member.findFirst({
        where: { OR: nameSearchFilter(q) },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          email: true,
          isActive: true,
          dateOfBirth: true,
          safeguardingCleared: true,
          family: { select: { familyName: true } },
          departmentMemberships: {
            where: { isActive: true },
            select: { roleTitle: true, department: { select: { name: true } } },
          },
          attendances: {
            where: { event: { startsAt: { gte: since } } },
            select: { status: true },
          },
          volunteerAssignments: {
            where: { event: { startsAt: { gte: since } } },
            orderBy: { event: { startsAt: "desc" } },
            take: 5,
            select: {
              status: true,
              role: { select: { name: true } },
              event: { select: { name: true, startsAt: true } },
            },
          },
        },
      });

      if (!member) return { error: "No member found matching that name, phone, or email." };

      const attended = member.attendances.filter(
        (a) => a.status === "PRESENT" || a.status === "LATE",
      ).length;
      const attendanceRatePercent = member.attendances.length
        ? Math.round((attended / member.attendances.length) * 100)
        : null;

      const result: Record<string, unknown> = {
        name: `${member.firstName} ${member.lastName}`,
        phone: member.phone,
        email: member.email,
        active: member.isActive,
        // For volunteer-eligibility questions — pair with list_volunteer_roles.
        age: member.dateOfBirth ? ageOn(member.dateOfBirth) : null,
        safeguardingCleared: member.safeguardingCleared,
        family: member.family?.familyName ?? null,
        departments: member.departmentMemberships.map((d) => ({
          name: d.department.name,
          role: d.roleTitle,
        })),
        periodMonths: months,
        attendanceRatePercent,
        recentVolunteering: member.volunteerAssignments.map((a) => ({
          event: a.event.name,
          date: a.event.startsAt.toISOString().slice(0, 10),
          role: a.role.name,
          status: a.status,
        })),
      };

      if (canSeeFinance(user)) {
        const giving = await prisma.contribution.aggregate({
          where: { memberId: member.id, receivedOn: { gte: since } },
          _sum: { amount: true },
        });
        result.givingTotalInPeriod = (giving._sum.amount ?? new Prisma.Decimal(0)).toString();
      }

      return result;
    }

    case "search_families": {
      const q = typeof input.query === "string" ? input.query.trim() : "";
      if (!q) return { error: "A family name is required." };

      const families = await prisma.family.findMany({
        where: { familyName: { contains: q, mode: "insensitive" } },
        take: clamp(input.limit, 1, 20, 5),
        orderBy: { familyName: "asc" },
        select: {
          familyName: true,
          address: true,
          city: true,
          phone: true,
          members: {
            select: { firstName: true, lastName: true, isFamilyHead: true, isActive: true },
          },
        },
      });

      return {
        count: families.length,
        families: families.map((f) => ({
          name: f.familyName,
          address: f.address,
          city: f.city,
          phone: f.phone,
          members: f.members.map((m) => ({
            name: `${m.firstName} ${m.lastName}`,
            head: m.isFamilyHead,
            active: m.isActive,
          })),
        })),
      };
    }

    case "get_department_roster": {
      const name = typeof input.departmentName === "string" ? input.departmentName.trim() : "";
      if (!name) return { error: "A department name is required." };

      const department = await prisma.department.findFirst({
        where: { name: { contains: name, mode: "insensitive" } },
        select: {
          name: true,
          description: true,
          isActive: true,
          leader: { select: { name: true } },
          members: {
            where: { isActive: true },
            select: { roleTitle: true, member: { select: { firstName: true, lastName: true } } },
          },
        },
      });

      if (!department) return { error: `No department found named "${name}".` };

      return {
        name: department.name,
        description: department.description,
        active: department.isActive,
        leader: department.leader?.name ?? null,
        memberCount: department.members.length,
        members: department.members.map((m) => ({
          name: `${m.member.firstName} ${m.member.lastName}`,
          role: m.roleTitle,
        })),
      };
    }

    case "get_past_events": {
      const months = clamp(input.months, 1, 12, 3);
      const requestedType = typeof input.eventType === "string" ? input.eventType.toUpperCase() : "";
      const eventType = (eventTypes as readonly string[]).includes(requestedType)
        ? (requestedType as (typeof eventTypes)[number])
        : undefined;

      const events = await prisma.event.findMany({
        where: {
          startsAt: { gte: monthsAgo(months - 1), lt: new Date() },
          ...(eventType ? { type: eventType } : {}),
        },
        orderBy: { startsAt: "desc" },
        take: clamp(input.limit, 1, 30, 10),
        select: {
          name: true,
          type: true,
          startsAt: true,
          location: true,
          capacity: true,
          _count: {
            select: {
              attendances: { where: { status: { in: ["PRESENT", "LATE"] } } },
              assignments: true,
            },
          },
        },
      });

      return {
        periodMonths: months,
        count: events.length,
        events: events.map((e) => ({
          name: e.name,
          type: e.type,
          date: e.startsAt.toISOString().slice(0, 10),
          location: e.location,
          attendance: e._count.attendances,
          // Null unless this event had a capacity set.
          capacity: e.capacity,
          volunteers: e._count.assignments,
        })),
      };
    }

    case "list_volunteer_roles": {
      const roles = await prisma.volunteerRole.findMany({
        orderBy: { name: "asc" },
        select: {
          name: true,
          description: true,
          isActive: true,
          minimumAge: true,
          requiresSafeguardingClearance: true,
          _count: { select: { assignments: true } },
        },
      });

      return {
        roles: roles.map((r) => ({
          name: r.name,
          description: r.description,
          active: r.isActive,
          minimumAge: r.minimumAge,
          requiresSafeguardingClearance: r.requiresSafeguardingClearance,
          totalAssignments: r._count.assignments,
        })),
      };
    }

    case "get_recent_activity": {
      if (user.role !== "ADMIN") {
        return {
          error:
            "Access denied. The activity log is restricted to the ADMIN role. " +
            "Tell the user their role does not permit viewing this.",
        };
      }

      const entries = await prisma.auditLog.findMany({
        where: typeof input.entity === "string" && input.entity ? { entity: input.entity } : undefined,
        orderBy: { createdAt: "desc" },
        take: clamp(input.limit, 1, 50, 15),
        select: {
          action: true,
          entity: true,
          summary: true,
          createdAt: true,
          user: { select: { name: true } },
        },
      });

      return {
        count: entries.length,
        entries: entries.map((e) => ({
          when: e.createdAt.toISOString(),
          who: e.user?.name ?? "System",
          action: e.action,
          entity: e.entity,
          summary: e.summary,
        })),
      };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
};

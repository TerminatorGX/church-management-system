import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../lib/async-handler";
import { badRequest, conflict, forbidden, notFound } from "../../lib/http-error";
import { audit } from "../../lib/audit";
import { validate } from "../../middleware/validate";
import { requireAuth, requireRole, requireStaff } from "../../middleware/auth";
import { paginated, paginationSchema, toSkipTake } from "../../lib/pagination";
import { ageOn } from "../../lib/dates";

export const volunteersRouter = Router();
volunteersRouter.use(requireAuth);

const statuses = ["PENDING", "CONFIRMED", "DECLINED", "COMPLETED", "CANCELLED"] as const;

// --- Volunteer roles -------------------------------------------------------

const roleBody = z.object({
  name: z.string().min(1, "Role name is required"),
  description: z.string().nullish(),
  isActive: z.boolean().default(true),
  /// Independent safeguarding factors — a role can require either, both, or
  /// neither. See Member.safeguardingCleared for why clearance exists
  /// alongside age rather than age alone.
  minimumAge: z.coerce.number().int().min(0).max(120).nullish(),
  requiresSafeguardingClearance: z.boolean().default(false),
});

volunteersRouter.get(
  "/roles",
  asyncHandler(async (_req, res) => {
    const data = await prisma.volunteerRole.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { assignments: true } } },
    });
    res.json({ data });
  }),
);

volunteersRouter.post(
  "/roles",
  requireStaff,
  validate(roleBody),
  asyncHandler(async (req, res) => {
    const role = await prisma.volunteerRole.create({ data: req.body as z.infer<typeof roleBody> });
    audit(req, { action: "CREATE", entity: "VolunteerRole", entityId: role.id, summary: role.name });
    res.status(201).json({ data: role });
  }),
);

volunteersRouter.patch(
  "/roles/:id",
  requireStaff,
  validate(roleBody.partial()),
  asyncHandler(async (req, res) => {
    const role = await prisma.volunteerRole.update({
      where: { id: req.params.id! },
      data: req.body as Partial<z.infer<typeof roleBody>>,
    });
    res.json({ data: role });
  }),
);

volunteersRouter.delete(
  "/roles/:id",
  requireRole(),
  asyncHandler(async (req, res) => {
    const count = await prisma.volunteerAssignment.count({ where: { roleId: req.params.id! } });
    if (count > 0) {
      throw badRequest(`This role has ${count} assignment(s). Deactivate it instead of deleting.`);
    }
    await prisma.volunteerRole.delete({ where: { id: req.params.id! } });
    res.json({ message: "Role deleted" });
  }),
);

// --- Assignments -----------------------------------------------------------

const assignmentBody = z.object({
  memberId: z.string().uuid(),
  eventId: z.string().uuid(),
  roleId: z.string().uuid(),
  status: z.enum(statuses).default("PENDING"),
  notes: z.string().nullish(),
  serviceHours: z.coerce.number().min(0).max(999).nullish(),
});

const listQuery = paginationSchema.extend({
  eventId: z.string().uuid().optional(),
  memberId: z.string().uuid().optional(),
  roleId: z.string().uuid().optional(),
  status: z.enum(statuses).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  upcoming: z.coerce.boolean().optional(),
});

volunteersRouter.get(
  "/assignments",
  validate(listQuery, "query"),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as z.infer<typeof listQuery>;

    const where: Prisma.VolunteerAssignmentWhereInput = {
      ...(q.eventId ? { eventId: q.eventId } : {}),
      ...(q.memberId ? { memberId: q.memberId } : {}),
      ...(q.roleId ? { roleId: q.roleId } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.from || q.to || q.upcoming
        ? {
            event: {
              startsAt: {
                ...(q.from ? { gte: q.from } : {}),
                ...(q.to ? { lte: q.to } : {}),
                ...(q.upcoming ? { gte: new Date() } : {}),
              },
            },
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      prisma.volunteerAssignment.findMany({
        where,
        ...toSkipTake(q),
        orderBy: { event: { startsAt: q.upcoming ? "asc" : "desc" } },
        include: {
          member: { select: { id: true, firstName: true, lastName: true, phone: true, skills: true } },
          event: { select: { id: true, name: true, startsAt: true, type: true, location: true } },
          role: { select: { id: true, name: true } },
        },
      }),
      prisma.volunteerAssignment.count({ where }),
    ]);

    res.json(paginated(data, total, q));
  }),
);

/**
 * Two independent, combinable gates — a role can require a minimum age, a
 * safeguarding clearance, both, or neither. Age alone is a blunt proxy for
 * trustworthiness (an unvetted adult is no safer with children than a
 * mature teen), so clearance exists as a separate, fairer factor rather
 * than just raising the age bar.
 */
const isSafeguardingEligible = (
  member: { dateOfBirth: Date | null; safeguardingCleared: boolean },
  role: { minimumAge: number | null; requiresSafeguardingClearance: boolean },
) => {
  if (role.requiresSafeguardingClearance && !member.safeguardingCleared) return false;
  if (role.minimumAge != null) {
    if (!member.dateOfBirth) return false;
    if (ageOn(member.dateOfBirth) < role.minimumAge) return false;
  }
  return true;
};

/** Same check as `isSafeguardingEligible`, but with a specific reason for the 403. */
const assertSafeguardingEligible = (
  member: { firstName: string; lastName: string; dateOfBirth: Date | null; safeguardingCleared: boolean },
  role: { name: string; minimumAge: number | null; requiresSafeguardingClearance: boolean },
) => {
  const name = `${member.firstName} ${member.lastName}`;

  if (role.requiresSafeguardingClearance && !member.safeguardingCleared) {
    throw forbidden(
      `${name} hasn't completed safeguarding clearance yet, which "${role.name}" requires. Clear them on their member profile first.`,
    );
  }

  if (role.minimumAge != null) {
    if (!member.dateOfBirth) {
      throw forbidden(
        `"${role.name}" requires volunteers to be at least ${role.minimumAge} — ${name}'s date of birth isn't on file, so that can't be confirmed. Add it before assigning this role.`,
      );
    }
    const age = ageOn(member.dateOfBirth);
    if (age < role.minimumAge) {
      throw forbidden(`"${role.name}" requires volunteers to be at least ${role.minimumAge}. ${name} is ${age}.`);
    }
  }
};

volunteersRouter.post(
  "/assignments",
  requireStaff,
  validate(assignmentBody),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof assignmentBody>;

    const [member, role] = await Promise.all([
      prisma.member.findUnique({
        where: { id: body.memberId },
        select: { firstName: true, lastName: true, dateOfBirth: true, safeguardingCleared: true },
      }),
      prisma.volunteerRole.findUnique({
        where: { id: body.roleId },
        select: { name: true, minimumAge: true, requiresSafeguardingClearance: true },
      }),
    ]);
    if (!member) throw notFound("Member not found");
    if (!role) throw notFound("Volunteer role not found");
    assertSafeguardingEligible(member, role);

    // Double-booking a volunteer across two roles at the same event is the
    // scheduling mistake this module exists to prevent, and the (member,
    // event, role) unique constraint alone would not catch it.
    const clash = await prisma.volunteerAssignment.findFirst({
      where: {
        memberId: body.memberId,
        eventId: body.eventId,
        status: { notIn: ["DECLINED", "CANCELLED"] },
      },
      include: { role: { select: { name: true } }, member: { select: { firstName: true, lastName: true } } },
    });

    if (clash) {
      throw conflict(
        `${clash.member.firstName} ${clash.member.lastName} is already scheduled as ${clash.role.name} for this event.`,
      );
    }

    // The check above is a friendly fast-path; the real guarantee against two
    // concurrent requests double-booking the same member+event across
    // different roles is a partial unique index at the database level (see
    // migration 20260825144227_volunteer_no_double_booking).
    let assignment;
    try {
      assignment = await prisma.volunteerAssignment.create({
        data: {
          ...body,
          serviceHours: body.serviceHours == null ? null : new Prisma.Decimal(body.serviceHours.toFixed(2)),
          createdById: req.user!.id,
        },
        include: {
          member: { select: { id: true, firstName: true, lastName: true } },
          event: { select: { id: true, name: true, startsAt: true } },
          role: { select: { id: true, name: true } },
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw conflict("This member is already scheduled for this event.");
      }
      throw err;
    }

    audit(req, {
      action: "CREATE",
      entity: "VolunteerAssignment",
      entityId: assignment.id,
      summary: `${assignment.member.firstName} ${assignment.member.lastName} → ${assignment.role.name} @ ${assignment.event.name}`,
    });

    res.status(201).json({ data: assignment });
  }),
);

volunteersRouter.patch(
  "/assignments/:id",
  requireStaff,
  validate(assignmentBody.partial()),
  asyncHandler(async (req, res) => {
    const body = req.body as Partial<z.infer<typeof assignmentBody>>;

    // Only re-check eligibility when the member or role is actually changing —
    // re-deriving the full effective pair only in that case.
    if (body.memberId !== undefined || body.roleId !== undefined) {
      const current = await prisma.volunteerAssignment.findUnique({
        where: { id: req.params.id! },
        select: { memberId: true, roleId: true },
      });
      if (!current) throw notFound("Assignment not found");

      const [member, role] = await Promise.all([
        prisma.member.findUnique({
          where: { id: body.memberId ?? current.memberId },
          select: { firstName: true, lastName: true, dateOfBirth: true, safeguardingCleared: true },
        }),
        prisma.volunteerRole.findUnique({
          where: { id: body.roleId ?? current.roleId },
          select: { name: true, minimumAge: true, requiresSafeguardingClearance: true },
        }),
      ]);
      if (!member) throw notFound("Member not found");
      if (!role) throw notFound("Volunteer role not found");
      assertSafeguardingEligible(member, role);
    }

    let assignment;
    try {
      assignment = await prisma.volunteerAssignment.update({
        where: { id: req.params.id! },
        data: {
          ...body,
          ...(body.serviceHours === undefined
            ? {}
            : { serviceHours: body.serviceHours == null ? null : new Prisma.Decimal(body.serviceHours.toFixed(2)) }),
        },
        include: {
          member: { select: { firstName: true, lastName: true } },
          role: { select: { name: true } },
        },
      });
    } catch (err) {
      // Re-activating (e.g. status DECLINED -> CONFIRMED) can collide with the
      // "one active assignment per member per event" constraint if they've
      // since been booked into a different role for the same event.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw conflict("This member already has another active assignment for this event.");
      }
      throw err;
    }
    audit(req, { action: "UPDATE", entity: "VolunteerAssignment", entityId: assignment.id });
    res.json({ data: assignment });
  }),
);

volunteersRouter.delete(
  "/assignments/:id",
  requireStaff,
  asyncHandler(async (req, res) => {
    await prisma.volunteerAssignment.delete({ where: { id: req.params.id! } });
    audit(req, { action: "DELETE", entity: "VolunteerAssignment", entityId: req.params.id! });
    res.json({ message: "Assignment removed" });
  }),
);

/**
 * Suggests members for a role, ranked by whether the role name matches a
 * declared skill and how recently they last served. The CRM skills field is
 * what makes this useful rather than an alphabetical list.
 */
volunteersRouter.get(
  "/suggestions",
  validate(z.object({ roleId: z.string().uuid(), eventId: z.string().uuid() }), "query"),
  asyncHandler(async (req, res) => {
    const { roleId, eventId } = req.query as unknown as { roleId: string; eventId: string };

    const role = await prisma.volunteerRole.findUniqueOrThrow({ where: { id: roleId } });

    const alreadyOn = await prisma.volunteerAssignment.findMany({
      where: { eventId, status: { notIn: ["DECLINED", "CANCELLED"] } },
      select: { memberId: true },
    });

    const allCandidates = await prisma.member.findMany({
      where: { isActive: true, id: { notIn: alreadyOn.map((a) => a.memberId) } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        skills: true,
        dateOfBirth: true,
        safeguardingCleared: true,
        volunteerAssignments: {
          where: { roleId },
          select: { id: true, createdAt: true },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });
    // Suggesting someone who'd just get a 403 on assignment isn't useful —
    // filter to who's actually eligible for this specific role.
    const candidates = allCandidates.filter((m) => isSafeguardingEligible(m, role));

    const needle = role.name.toLowerCase();
    const ranked = candidates
      .map((m) => {
        const skillMatch = m.skills.some((s) => s.toLowerCase().includes(needle) || needle.includes(s.toLowerCase()));
        const lastServed = m.volunteerAssignments[0]?.createdAt ?? null;

        // Never served in this role sorts above everyone; otherwise the
        // longer since they last served, the higher they rank, so the rota
        // rotates instead of leaning on the same few people.
        const restDays = lastServed
          ? Math.min(365, (Date.now() - lastServed.getTime()) / 86_400_000)
          : 366;

        return {
          member: { id: m.id, firstName: m.firstName, lastName: m.lastName, phone: m.phone, skills: m.skills },
          skillMatch,
          lastServed,
          // Skill match dominates; rest time breaks ties.
          score: (skillMatch ? 1000 : 0) + restDays,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 15);

    res.json({ data: { role, suggestions: ranked } });
  }),
);

import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../lib/async-handler";
import { notFound } from "../../lib/http-error";
import { audit } from "../../lib/audit";
import { validate } from "../../middleware/validate";
import { requireAuth, requireRole, requireStaff } from "../../middleware/auth";
import { paginated, paginationSchema, toSkipTake } from "../../lib/pagination";
import { toCsv } from "../../lib/csv";
import {
  nameField,
  normalizeZambianPhone,
  optionalEmailField,
  optionalZambianPhone,
  pastOrPresentDate,
} from "../../lib/validators";

export const membersRouter = Router();
membersRouter.use(requireAuth);

const memberFields = z.object({
  firstName: nameField("First name"),
  lastName: nameField("Last name"),
  email: optionalEmailField,
  phone: optionalZambianPhone,
  dateOfBirth: pastOrPresentDate("Date of birth").nullish(),
  gender: z.enum(["MALE", "FEMALE", "UNSPECIFIED"]).default("UNSPECIFIED"),
  maritalStatus: z.enum(["SINGLE", "MARRIED", "WIDOWED", "DIVORCED", "UNSPECIFIED"]).default("UNSPECIFIED"),
  baptismDate: pastOrPresentDate("Baptism date").nullish(),
  joinedDate: pastOrPresentDate("Joined date").nullish(),
  address: z.string().trim().nullish(),
  city: z.string().trim().nullish(),
  province: z.string().trim().nullish(),
  occupation: z.string().trim().nullish(),
  notes: z.string().trim().nullish(),
  isActive: z.boolean().default(true),
  skills: z.array(z.string().trim().min(1)).default([]),
  interests: z.array(z.string().trim().min(1)).default([]),
  familyId: z.string().uuid().nullish(),
  isFamilyHead: z.boolean().default(false),
  safeguardingCleared: z.boolean().default(false),
});

/** A baby can be baptised the day they're born, but not before. */
const baptismNotBeforeBirth = (v: { dateOfBirth?: Date | null; baptismDate?: Date | null }) =>
  !v.dateOfBirth || !v.baptismDate || v.baptismDate >= v.dateOfBirth;

const BAPTISM_ORDER_ISSUE = {
  message: "Baptism date can't be before the date of birth",
  path: ["baptismDate"],
};

/** `.refine()` returns a ZodEffects, which has no `.partial()` — so the
 *  partial variant is derived from the plain object and re-refined (same
 *  pattern as events.routes.ts). */
const memberBody = memberFields.refine(baptismNotBeforeBirth, BAPTISM_ORDER_ISSUE);
const memberPatchBody = memberFields.partial().refine(baptismNotBeforeBirth, BAPTISM_ORDER_ISSUE);

/** Empty-string email from a form means "no email", not an empty value. */
const normalize = <T extends { email?: string | null }>(body: T) => ({
  ...body,
  email: body.email ? body.email : null,
});

const listQuery = paginationSchema.extend({
  search: z.string().trim().optional(),
  isActive: z
    .enum(["true", "false", "all"])
    .default("true")
    .transform((v) => (v === "all" ? undefined : v === "true")),
  familyId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
  skill: z.string().trim().optional(),
  sort: z.enum(["name", "recent", "joined"]).default("name"),
});

const buildWhere = (q: z.infer<typeof listQuery>): Prisma.MemberWhereInput => ({
  ...(q.isActive === undefined ? {} : { isActive: q.isActive }),
  ...(q.familyId ? { familyId: q.familyId } : {}),
  ...(q.skill ? { skills: { has: q.skill } } : {}),
  ...(q.departmentId
    ? { departmentMemberships: { some: { departmentId: q.departmentId, isActive: true } } }
    : {}),
  ...(q.search
    ? {
        OR: [
          { firstName: { contains: q.search, mode: "insensitive" } },
          { lastName: { contains: q.search, mode: "insensitive" } },
          { email: { contains: q.search, mode: "insensitive" } },
          { phone: { contains: q.search } },
        ],
      }
    : {}),
});

const orderFor = (sort: string): Prisma.MemberOrderByWithRelationInput[] =>
  sort === "recent"
    ? [{ createdAt: "desc" }]
    : sort === "joined"
      ? [{ joinedDate: "desc" }]
      : [{ lastName: "asc" }, { firstName: "asc" }];

membersRouter.get(
  "/",
  validate(listQuery, "query"),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as z.infer<typeof listQuery>;
    const where = buildWhere(q);

    const [data, total] = await Promise.all([
      prisma.member.findMany({
        where,
        ...toSkipTake(q),
        orderBy: orderFor(q.sort),
        include: {
          family: { select: { id: true, familyName: true } },
          departmentMemberships: {
            where: { isActive: true },
            select: { roleTitle: true, department: { select: { id: true, name: true } } },
          },
        },
      }),
      prisma.member.count({ where }),
    ]);

    res.json(paginated(data, total, q));
  }),
);

/** CSV export — the proposal calls this out as a deliverable. */
membersRouter.get(
  "/export",
  requireStaff,
  validate(listQuery.omit({ page: true, pageSize: true }), "query"),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as z.infer<typeof listQuery>;
    const members = await prisma.member.findMany({
      where: buildWhere(q),
      orderBy: orderFor(q.sort),
      include: { family: { select: { familyName: true } } },
    });

    const csv = toCsv(members, [
      ["First name", (m) => m.firstName],
      ["Last name", (m) => m.lastName],
      ["Email", (m) => m.email],
      ["Phone", (m) => m.phone],
      ["Gender", (m) => m.gender],
      ["Marital status", (m) => m.maritalStatus],
      ["Date of birth", (m) => m.dateOfBirth?.toISOString().slice(0, 10)],
      ["Joined", (m) => m.joinedDate?.toISOString().slice(0, 10)],
      ["Family", (m) => m.family?.familyName],
      ["City", (m) => m.city],
      ["Province", (m) => m.province],
      ["Skills", (m) => m.skills.join("; ")],
      ["Active", (m) => (m.isActive ? "Yes" : "No")],
    ]);

    audit(req, { action: "EXPORT", entity: "Member", summary: `Exported ${members.length} members` });
    res.header("Content-Type", "text/csv; charset=utf-8");
    res.attachment(`members-${new Date().toISOString().slice(0, 10)}.csv`);
    res.send(csv);
  }),
);

const duplicateCheckQuery = z.object({
  firstName: z.string().trim().optional(),
  lastName: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  email: z.string().trim().optional(),
  excludeId: z.string().uuid().optional(),
});

/**
 * Surfaces possible duplicates so a human can judge — it never blocks saving.
 * Shared names are common (several "John Banda"s in one congregation is
 * normal), so a name match alone is reported as a low-confidence "heads up",
 * while a matching phone or email — much less likely to be shared — is
 * reported as a stronger signal. The caller decides; this only shows the
 * evidence (name, phone, email, DOB, family) a person needs to tell two
 * same-named members apart.
 */
membersRouter.get(
  "/possible-duplicates",
  requireStaff,
  validate(duplicateCheckQuery, "query"),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as z.infer<typeof duplicateCheckQuery>;
    const hasName = Boolean(q.firstName && q.lastName);
    // Stored numbers/emails are always normalised (see validators.ts) — a
    // caller that sends "0971 234 567" or mixed-case email must be
    // normalised the same way before an exact-match lookup can find it.
    const phone = q.phone ? normalizeZambianPhone(q.phone) : null;
    const email = q.email ? q.email.trim().toLowerCase() : null;

    const or: Prisma.MemberWhereInput[] = [];
    if (phone) or.push({ phone });
    if (email) or.push({ email });
    if (hasName) {
      or.push({
        firstName: { equals: q.firstName, mode: "insensitive" },
        lastName: { equals: q.lastName, mode: "insensitive" },
      });
    }

    if (or.length === 0) return res.json({ data: [] });

    const candidates = await prisma.member.findMany({
      where: {
        OR: or,
        ...(q.excludeId ? { id: { not: q.excludeId } } : {}),
      },
      take: 5,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        email: true,
        dateOfBirth: true,
        isActive: true,
        family: { select: { familyName: true } },
      },
    });

    res.json({
      data: candidates.map((c) => ({
        ...c,
        matchedOn: [
          phone && c.phone === phone ? "phone" : null,
          email && c.email === email ? "email" : null,
          hasName &&
          c.firstName.toLowerCase() === q.firstName!.toLowerCase() &&
          c.lastName.toLowerCase() === q.lastName!.toLowerCase()
            ? "name"
            : null,
        ].filter((x): x is string => x !== null),
      })),
    });
  }),
);

membersRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const member = await prisma.member.findUnique({
      where: { id: req.params.id! },
      include: {
        family: { include: { members: { select: { id: true, firstName: true, lastName: true, isFamilyHead: true } } } },
        departmentMemberships: { include: { department: { select: { id: true, name: true } } } },
        attendances: {
          take: 10,
          orderBy: { event: { startsAt: "desc" } },
          include: { event: { select: { id: true, name: true, startsAt: true, type: true } } },
        },
        volunteerAssignments: {
          take: 10,
          orderBy: { event: { startsAt: "desc" } },
          include: {
            event: { select: { id: true, name: true, startsAt: true } },
            role: { select: { id: true, name: true } },
          },
        },
        user: { select: { id: true, email: true, role: true } },
      },
    });

    if (!member) throw notFound("Member not found");

    // Giving totals are finance data — only surface them to those who may see it.
    const canSeeGiving = req.user!.role === "ADMIN" || req.user!.role === "FINANCE";
    const giving = canSeeGiving
      ? await prisma.contribution.aggregate({
          where: { memberId: member.id },
          _sum: { amount: true },
          _count: true,
        })
      : null;

    const attendanceCount = await prisma.attendance.count({
      where: { memberId: member.id, status: { in: ["PRESENT", "LATE"] } },
    });

    res.json({
      data: {
        ...member,
        stats: {
          attendanceCount,
          ...(giving
            ? { totalGiven: giving._sum.amount?.toString() ?? "0", contributionCount: giving._count }
            : {}),
        },
      },
    });
  }),
);

membersRouter.post(
  "/",
  requireStaff,
  validate(memberBody),
  asyncHandler(async (req, res) => {
    const body = normalize(req.body as z.infer<typeof memberBody>);
    const member = await prisma.member.create({ data: body });
    audit(req, {
      action: "CREATE",
      entity: "Member",
      entityId: member.id,
      summary: `Added ${member.firstName} ${member.lastName}`,
    });
    res.status(201).json({ data: member });
  }),
);

membersRouter.patch(
  "/:id",
  requireStaff,
  validate(memberPatchBody),
  asyncHandler(async (req, res) => {
    const body = normalize(req.body as Partial<z.infer<typeof memberBody>>);
    const member = await prisma.member.update({ where: { id: req.params.id! }, data: body });
    audit(req, {
      action: "UPDATE",
      entity: "Member",
      entityId: member.id,
      summary: `Updated ${member.firstName} ${member.lastName}`,
    });
    res.json({ data: member });
  }),
);

/**
 * Soft delete. Contribution and attendance history must survive a member
 * leaving the church, both for financial audit and for historical reporting.
 */
membersRouter.delete(
  "/:id",
  requireRole(),
  asyncHandler(async (req, res) => {
    const member = await prisma.member.update({
      where: { id: req.params.id! },
      data: { isActive: false },
    });
    audit(req, {
      action: "DELETE",
      entity: "Member",
      entityId: member.id,
      summary: `Archived ${member.firstName} ${member.lastName}`,
    });
    res.json({ data: member, message: "Member archived. History has been preserved." });
  }),
);

// --- Department membership -------------------------------------------------

const deptAssignSchema = z.object({
  departmentId: z.string().uuid(),
  roleTitle: z.string().nullish(),
});

membersRouter.post(
  "/:id/departments",
  requireStaff,
  validate(deptAssignSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof deptAssignSchema>;
    const link = await prisma.departmentMember.upsert({
      where: { memberId_departmentId: { memberId: req.params.id!, departmentId: body.departmentId } },
      create: { memberId: req.params.id!, departmentId: body.departmentId, roleTitle: body.roleTitle ?? null },
      update: { roleTitle: body.roleTitle ?? null, isActive: true, endDate: null },
      include: { department: { select: { id: true, name: true } } },
    });
    res.status(201).json({ data: link });
  }),
);

membersRouter.delete(
  "/:id/departments/:departmentId",
  requireStaff,
  asyncHandler(async (req, res) => {
    await prisma.departmentMember.update({
      where: {
        memberId_departmentId: { memberId: req.params.id!, departmentId: req.params.departmentId! },
      },
      data: { isActive: false, endDate: new Date() },
    });
    res.json({ message: "Removed from department" });
  }),
);

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

export const membersRouter = Router();
membersRouter.use(requireAuth);

const dateish = z.coerce.date().nullish();

const memberBody = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email().nullish().or(z.literal("")),
  phone: z.string().nullish(),
  dateOfBirth: dateish,
  gender: z.enum(["MALE", "FEMALE", "UNSPECIFIED"]).default("UNSPECIFIED"),
  maritalStatus: z.enum(["SINGLE", "MARRIED", "WIDOWED", "DIVORCED", "UNSPECIFIED"]).default("UNSPECIFIED"),
  baptismDate: dateish,
  joinedDate: dateish,
  address: z.string().nullish(),
  city: z.string().nullish(),
  occupation: z.string().nullish(),
  notes: z.string().nullish(),
  isActive: z.boolean().default(true),
  skills: z.array(z.string().min(1)).default([]),
  interests: z.array(z.string().min(1)).default([]),
  familyId: z.string().uuid().nullish(),
  isFamilyHead: z.boolean().default(false),
});

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
      ["Skills", (m) => m.skills.join("; ")],
      ["Active", (m) => (m.isActive ? "Yes" : "No")],
    ]);

    audit(req, { action: "EXPORT", entity: "Member", summary: `Exported ${members.length} members` });
    res.header("Content-Type", "text/csv; charset=utf-8");
    res.attachment(`members-${new Date().toISOString().slice(0, 10)}.csv`);
    res.send(csv);
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
  validate(memberBody.partial()),
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

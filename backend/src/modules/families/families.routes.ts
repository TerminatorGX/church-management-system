import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../lib/async-handler";
import { badRequest, notFound } from "../../lib/http-error";
import { audit } from "../../lib/audit";
import { validate } from "../../middleware/validate";
import { requireAuth, requireRole, requireStaff } from "../../middleware/auth";
import { paginated, paginationSchema, toSkipTake } from "../../lib/pagination";
import { nameField, optionalZambianPhone } from "../../lib/validators";

export const familiesRouter = Router();
familiesRouter.use(requireAuth);

const familyBody = z.object({
  familyName: nameField("Family name"),
  address: z.string().trim().nullish(),
  city: z.string().trim().nullish(),
  phone: optionalZambianPhone,
  notes: z.string().trim().nullish(),
});

const listQuery = paginationSchema.extend({
  search: z.string().trim().optional(),
});

familiesRouter.get(
  "/",
  validate(listQuery, "query"),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as z.infer<typeof listQuery>;
    const where = q.search ? { familyName: { contains: q.search, mode: "insensitive" as const } } : {};

    const [data, total] = await Promise.all([
      prisma.family.findMany({
        where,
        ...toSkipTake(q),
        orderBy: { familyName: "asc" },
        include: {
          _count: { select: { members: true } },
          members: {
            where: { isFamilyHead: true },
            select: { id: true, firstName: true, lastName: true, phone: true },
          },
        },
      }),
      prisma.family.count({ where }),
    ]);

    res.json(paginated(data, total, q));
  }),
);

familiesRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const family = await prisma.family.findUnique({
      where: { id: req.params.id! },
      include: {
        members: {
          orderBy: [{ isFamilyHead: "desc" }, { dateOfBirth: "asc" }],
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            dateOfBirth: true,
            isFamilyHead: true,
            isActive: true,
          },
        },
      },
    });
    if (!family) throw notFound("Family not found");
    res.json({ data: family });
  }),
);

familiesRouter.post(
  "/",
  requireStaff,
  validate(familyBody),
  asyncHandler(async (req, res) => {
    const family = await prisma.family.create({ data: req.body as z.infer<typeof familyBody> });
    audit(req, { action: "CREATE", entity: "Family", entityId: family.id, summary: `Added ${family.familyName}` });
    res.status(201).json({ data: family });
  }),
);

familiesRouter.patch(
  "/:id",
  requireStaff,
  validate(familyBody.partial()),
  asyncHandler(async (req, res) => {
    const family = await prisma.family.update({
      where: { id: req.params.id! },
      data: req.body as Partial<z.infer<typeof familyBody>>,
    });
    audit(req, { action: "UPDATE", entity: "Family", entityId: family.id, summary: `Updated ${family.familyName}` });
    res.json({ data: family });
  }),
);

familiesRouter.delete(
  "/:id",
  requireRole(),
  asyncHandler(async (req, res) => {
    const count = await prisma.member.count({ where: { familyId: req.params.id! } });
    if (count > 0) {
      throw badRequest(
        `This family still has ${count} member(s). Move them to another family first.`,
      );
    }
    await prisma.family.delete({ where: { id: req.params.id! } });
    audit(req, { action: "DELETE", entity: "Family", entityId: req.params.id! });
    res.json({ message: "Family deleted" });
  }),
);

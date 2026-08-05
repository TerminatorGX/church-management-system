import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../lib/async-handler";
import { notFound } from "../../lib/http-error";
import { audit } from "../../lib/audit";
import { validate } from "../../middleware/validate";
import { requireAuth, requireRole } from "../../middleware/auth";

export const departmentsRouter = Router();
departmentsRouter.use(requireAuth);

const departmentBody = z.object({
  name: z.string().min(1, "Department name is required"),
  description: z.string().nullish(),
  leaderId: z.string().uuid().nullish(),
  isActive: z.boolean().default(true),
});

departmentsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const data = await prisma.department.findMany({
      orderBy: { name: "asc" },
      include: {
        leader: { select: { id: true, name: true, email: true } },
        _count: { select: { members: { where: { isActive: true } } } },
      },
    });
    res.json({ data });
  }),
);

departmentsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const department = await prisma.department.findUnique({
      where: { id: req.params.id! },
      include: {
        leader: { select: { id: true, name: true, email: true } },
        members: {
          where: { isActive: true },
          include: {
            member: { select: { id: true, firstName: true, lastName: true, phone: true, email: true } },
          },
        },
      },
    });
    if (!department) throw notFound("Department not found");
    res.json({ data: department });
  }),
);

departmentsRouter.post(
  "/",
  requireRole(),
  validate(departmentBody),
  asyncHandler(async (req, res) => {
    const department = await prisma.department.create({ data: req.body as z.infer<typeof departmentBody> });
    audit(req, { action: "CREATE", entity: "Department", entityId: department.id, summary: department.name });
    res.status(201).json({ data: department });
  }),
);

departmentsRouter.patch(
  "/:id",
  requireRole(),
  validate(departmentBody.partial()),
  asyncHandler(async (req, res) => {
    const department = await prisma.department.update({
      where: { id: req.params.id! },
      data: req.body as Partial<z.infer<typeof departmentBody>>,
    });
    audit(req, { action: "UPDATE", entity: "Department", entityId: department.id, summary: department.name });
    res.json({ data: department });
  }),
);

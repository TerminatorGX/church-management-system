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

export const eventsRouter = Router();
eventsRouter.use(requireAuth);

const eventTypes = ["SUNDAY_SERVICE", "MIDWEEK_SERVICE", "SMALL_GROUP", "SPECIAL_EVENT", "OUTREACH", "CONFERENCE"] as const;

const eventFields = z.object({
  name: z.string().min(1, "Event name is required"),
  type: z.enum(eventTypes).default("SUNDAY_SERVICE"),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date().nullish(),
  location: z.string().nullish(),
  description: z.string().nullish(),
  departmentId: z.string().uuid().nullish(),
});

/** `.refine()` returns a ZodEffects, which has no `.partial()` — so the
 *  partial variant is derived from the plain object and re-refined. */
const endsAfterStart = (v: { startsAt?: Date; endsAt?: Date | null }) =>
  !v.endsAt || !v.startsAt || v.endsAt >= v.startsAt;

const eventBody = eventFields.refine(endsAfterStart, {
  message: "End time must be after the start time",
  path: ["endsAt"],
});

const eventPatchBody = eventFields.partial().refine(endsAfterStart, {
  message: "End time must be after the start time",
  path: ["endsAt"],
});

const listQuery = paginationSchema.extend({
  search: z.string().trim().optional(),
  type: z.enum(eventTypes).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  upcoming: z.coerce.boolean().optional(),
  order: z.enum(["asc", "desc"]).default("desc"),
});

eventsRouter.get(
  "/",
  validate(listQuery, "query"),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as z.infer<typeof listQuery>;

    const where: Prisma.EventWhereInput = {
      ...(q.type ? { type: q.type } : {}),
      ...(q.search ? { name: { contains: q.search, mode: "insensitive" } } : {}),
      ...(q.from || q.to || q.upcoming
        ? {
            startsAt: {
              ...(q.from ? { gte: q.from } : {}),
              ...(q.to ? { lte: q.to } : {}),
              ...(q.upcoming ? { gte: new Date() } : {}),
            },
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      prisma.event.findMany({
        where,
        ...toSkipTake(q),
        orderBy: { startsAt: q.upcoming ? "asc" : q.order },
        include: {
          department: { select: { id: true, name: true } },
          _count: { select: { attendances: true, assignments: true } },
        },
      }),
      prisma.event.count({ where }),
    ]);

    res.json(paginated(data, total, q));
  }),
);

eventsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const event = await prisma.event.findUnique({
      where: { id: req.params.id! },
      include: {
        department: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        assignments: {
          include: {
            member: { select: { id: true, firstName: true, lastName: true, phone: true } },
            role: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!event) throw notFound("Event not found");

    const byStatus = await prisma.attendance.groupBy({
      by: ["status"],
      where: { eventId: event.id },
      _count: true,
    });

    res.json({
      data: {
        ...event,
        attendanceSummary: Object.fromEntries(byStatus.map((r) => [r.status, r._count])),
      },
    });
  }),
);

eventsRouter.post(
  "/",
  requireStaff,
  validate(eventBody),
  asyncHandler(async (req, res) => {
    const event = await prisma.event.create({
      data: { ...(req.body as z.infer<typeof eventBody>), createdById: req.user!.id },
    });
    audit(req, { action: "CREATE", entity: "Event", entityId: event.id, summary: event.name });
    res.status(201).json({ data: event });
  }),
);

eventsRouter.patch(
  "/:id",
  requireStaff,
  validate(eventPatchBody),
  asyncHandler(async (req, res) => {
    const event = await prisma.event.update({
      where: { id: req.params.id! },
      data: req.body as z.infer<typeof eventPatchBody>,
    });
    audit(req, { action: "UPDATE", entity: "Event", entityId: event.id, summary: event.name });
    res.json({ data: event });
  }),
);

eventsRouter.delete(
  "/:id",
  requireRole(),
  asyncHandler(async (req, res) => {
    const event = await prisma.event.delete({ where: { id: req.params.id! } });
    audit(req, { action: "DELETE", entity: "Event", entityId: event.id, summary: event.name });
    res.json({ message: "Event deleted along with its attendance and volunteer records" });
  }),
);

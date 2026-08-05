import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../lib/async-handler";
import { notFound } from "../../lib/http-error";
import { audit } from "../../lib/audit";
import { validate } from "../../middleware/validate";
import { requireAuth, requireStaff } from "../../middleware/auth";

export const attendanceRouter = Router();
attendanceRouter.use(requireAuth);

const statuses = ["PRESENT", "ABSENT", "LATE", "EXCUSED"] as const;

/**
 * The check-in sheet for one event: every active member, with the attendance
 * status already recorded for them (null if not yet marked). This is what the
 * proposal's "system displays list of expected attendees" workflow needs.
 */
attendanceRouter.get(
  "/event/:eventId",
  asyncHandler(async (req, res) => {
    const eventId = req.params.eventId!;
    const event = await prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw notFound("Event not found");

    const [members, recorded] = await Promise.all([
      prisma.member.findMany({
        where: { isActive: true },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          family: { select: { familyName: true } },
        },
      }),
      prisma.attendance.findMany({ where: { eventId } }),
    ]);

    const byMember = new Map(recorded.map((a) => [a.memberId, a]));

    res.json({
      data: {
        event,
        roster: members.map((m) => ({
          member: m,
          status: byMember.get(m.id)?.status ?? null,
          note: byMember.get(m.id)?.note ?? null,
        })),
        summary: {
          total: members.length,
          marked: recorded.length,
          present: recorded.filter((a) => a.status === "PRESENT" || a.status === "LATE").length,
        },
      },
    });
  }),
);

const bulkSchema = z.object({
  eventId: z.string().uuid(),
  entries: z
    .array(
      z.object({
        memberId: z.string().uuid(),
        status: z.enum(statuses),
        note: z.string().nullish(),
      }),
    )
    .min(1, "Mark at least one person"),
});

/**
 * Bulk upsert so a whole service can be checked in with one request, and
 * re-submitting corrects earlier mistakes rather than erroring on the
 * (memberId, eventId) unique constraint.
 */
attendanceRouter.post(
  "/bulk",
  requireStaff,
  validate(bulkSchema),
  asyncHandler(async (req, res) => {
    const { eventId, entries } = req.body as z.infer<typeof bulkSchema>;
    const recordedById = req.user!.id;

    const result = await prisma.$transaction(
      entries.map((e) =>
        prisma.attendance.upsert({
          where: { memberId_eventId: { memberId: e.memberId, eventId } },
          create: { eventId, memberId: e.memberId, status: e.status, note: e.note ?? null, recordedById },
          update: { status: e.status, note: e.note ?? null, recordedById },
        }),
      ),
    );

    audit(req, {
      action: "CREATE",
      entity: "Attendance",
      entityId: eventId,
      summary: `Recorded attendance for ${result.length} member(s)`,
    });

    res.status(201).json({ data: result, message: `Attendance saved for ${result.length} member(s)` });
  }),
);

attendanceRouter.delete(
  "/:id",
  requireStaff,
  asyncHandler(async (req, res) => {
    await prisma.attendance.delete({ where: { id: req.params.id! } });
    audit(req, { action: "DELETE", entity: "Attendance", entityId: req.params.id! });
    res.json({ message: "Attendance record removed" });
  }),
);

/** Per-member attendance history with a simple engagement rate. */
attendanceRouter.get(
  "/member/:memberId",
  asyncHandler(async (req, res) => {
    const memberId = req.params.memberId!;

    const records = await prisma.attendance.findMany({
      where: { memberId },
      orderBy: { event: { startsAt: "desc" } },
      take: 50,
      include: { event: { select: { id: true, name: true, type: true, startsAt: true } } },
    });

    const attended = records.filter((r) => r.status === "PRESENT" || r.status === "LATE").length;

    res.json({
      data: records,
      stats: {
        recorded: records.length,
        attended,
        rate: records.length ? Math.round((attended / records.length) * 100) : 0,
      },
    });
  }),
);

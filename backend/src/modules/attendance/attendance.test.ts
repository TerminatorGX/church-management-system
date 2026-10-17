import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { app, loginAs, authHeader } from "../../test/helpers";
import { prisma } from "../../lib/prisma";

describe("attendance", () => {
  const createdMemberIds: string[] = [];
  const createdAttendanceIds: string[] = [];

  afterAll(async () => {
    if (createdAttendanceIds.length) {
      await prisma.attendance.deleteMany({ where: { id: { in: createdAttendanceIds } } });
    }
    if (createdMemberIds.length) {
      await prisma.member.deleteMany({ where: { id: { in: createdMemberIds } } });
    }
  });

  it("VIEWER cannot bulk-record attendance", async () => {
    const token = await loginAs("viewer@church.local");
    const events = await request(app).get("/api/events").set(authHeader(token));
    const eventId = events.body.data[0]?.id;

    const res = await request(app)
      .post("/api/attendance/bulk")
      .set(authHeader(token))
      .send({ eventId, entries: [{ memberId: "00000000-0000-0000-0000-000000000000", status: "PRESENT" }] });
    expect(res.status).toBe(403);
  });

  it("FINANCE can bulk-record attendance for a member with no prior record, and the roster reflects it", async () => {
    const token = await loginAs("finance@church.local");

    // A fresh member guarantees the bulk upsert below CREATEs a row rather
    // than updating one of the seed's existing attendance records.
    const member = await request(app)
      .post("/api/members")
      .set(authHeader(token))
      .send({ firstName: "VitestAttendance", lastName: `Fixture-${Date.now()}` });
    expect(member.status).toBe(201);
    createdMemberIds.push(member.body.data.id);

    const events = await request(app).get("/api/events").set(authHeader(token));
    const eventId = events.body.data[0]?.id;
    expect(eventId).toBeTruthy();

    const bulk = await request(app)
      .post("/api/attendance/bulk")
      .set(authHeader(token))
      .send({ eventId, entries: [{ memberId: member.body.data.id, status: "PRESENT" }] });
    expect(bulk.status).toBe(201);
    expect(bulk.body.data).toHaveLength(1);
    createdAttendanceIds.push(bulk.body.data[0].id);

    const roster = await request(app).get(`/api/attendance/event/${eventId}`).set(authHeader(token));
    expect(roster.status).toBe(200);
    const entry = roster.body.data.roster.find((r: { member: { id: string } }) => r.member.id === member.body.data.id);
    expect(entry?.status).toBe("PRESENT");
  });

  it("rejects a bulk request with no entries", async () => {
    const token = await loginAs("finance@church.local");
    const events = await request(app).get("/api/events").set(authHeader(token));
    const eventId = events.body.data[0]?.id;

    const res = await request(app)
      .post("/api/attendance/bulk")
      .set(authHeader(token))
      .send({ eventId, entries: [] });
    expect(res.status).toBe(400);
  });

  it("FINANCE (not just ADMIN) can delete an attendance record", async () => {
    const token = await loginAs("finance@church.local");
    expect(createdAttendanceIds.length).toBeGreaterThan(0);
    const id = createdAttendanceIds[0]!;

    const res = await request(app).delete(`/api/attendance/${id}`).set(authHeader(token));
    expect(res.status).toBe(200);
  });
});

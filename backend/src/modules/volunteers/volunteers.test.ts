import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { app, loginAs, authHeader } from "../../test/helpers";
import { prisma } from "../../lib/prisma";

describe("volunteers", () => {
  const createdAssignmentIds: string[] = [];
  const createdRoleIds: string[] = [];
  const createdMemberIds: string[] = [];

  afterAll(async () => {
    if (createdAssignmentIds.length) {
      await prisma.volunteerAssignment.deleteMany({ where: { id: { in: createdAssignmentIds } } });
    }
    if (createdRoleIds.length) {
      await prisma.volunteerRole.deleteMany({ where: { id: { in: createdRoleIds } } });
    }
    if (createdMemberIds.length) {
      await prisma.member.deleteMany({ where: { id: { in: createdMemberIds } } });
    }
  });

  it("VIEWER can list volunteer roles but cannot create one", async () => {
    const token = await loginAs("viewer@church.local");

    const list = await request(app).get("/api/volunteers/roles").set(authHeader(token));
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body.data)).toBe(true);

    const create = await request(app)
      .post("/api/volunteers/roles")
      .set(authHeader(token))
      .send({ name: "Should be blocked" });
    expect(create.status).toBe(403);
  });

  it("FINANCE can create a volunteer role", async () => {
    const token = await loginAs("finance@church.local");
    const create = await request(app)
      .post("/api/volunteers/roles")
      .set(authHeader(token))
      .send({ name: `Vitest Role ${Date.now()}` });
    expect(create.status).toBe(201);
    createdRoleIds.push(create.body.data.id);
  });

  it("assigns a volunteer, then rejects double-booking the same member at the same event in a second role", async () => {
    const token = await loginAs("finance@church.local");

    const member = await request(app)
      .post("/api/members")
      .set(authHeader(token))
      .send({ firstName: "VitestVolunteer", lastName: `Fixture-${Date.now()}` });
    expect(member.status).toBe(201);
    createdMemberIds.push(member.body.data.id);

    const roleA = await request(app)
      .post("/api/volunteers/roles")
      .set(authHeader(token))
      .send({ name: `Vitest Role A ${Date.now()}` });
    createdRoleIds.push(roleA.body.data.id);
    const roleB = await request(app)
      .post("/api/volunteers/roles")
      .set(authHeader(token))
      .send({ name: `Vitest Role B ${Date.now()}` });
    createdRoleIds.push(roleB.body.data.id);

    const events = await request(app).get("/api/events").set(authHeader(token));
    const eventId = events.body.data[0]?.id;
    expect(eventId).toBeTruthy();

    const first = await request(app)
      .post("/api/volunteers/assignments")
      .set(authHeader(token))
      .send({ memberId: member.body.data.id, eventId, roleId: roleA.body.data.id });
    expect(first.status).toBe(201);
    createdAssignmentIds.push(first.body.data.id);

    const clash = await request(app)
      .post("/api/volunteers/assignments")
      .set(authHeader(token))
      .send({ memberId: member.body.data.id, eventId, roleId: roleB.body.data.id });
    expect(clash.status).toBe(409);
  });

  it("rejects an assignment missing required fields", async () => {
    const token = await loginAs("finance@church.local");
    const res = await request(app).post("/api/volunteers/assignments").set(authHeader(token)).send({});
    expect(res.status).toBe(400);
  });

  it("blocks assigning an under-age member to a role with a minimum age", async () => {
    const token = await loginAs("finance@church.local");

    const nextYear = new Date();
    nextYear.setFullYear(nextYear.getFullYear() - 10); // a 10-year-old
    const member = await request(app)
      .post("/api/members")
      .set(authHeader(token))
      .send({
        firstName: "VitestMinor",
        lastName: `Fixture-${Date.now()}`,
        dateOfBirth: nextYear.toISOString().slice(0, 10),
      });
    expect(member.status).toBe(201);
    createdMemberIds.push(member.body.data.id);

    const role = await request(app)
      .post("/api/volunteers/roles")
      .set(authHeader(token))
      .send({ name: `Vitest Minimum Age Role ${Date.now()}`, minimumAge: 18 });
    createdRoleIds.push(role.body.data.id);

    const events = await request(app).get("/api/events").set(authHeader(token));
    const eventId = events.body.data[0]?.id;

    const res = await request(app)
      .post("/api/volunteers/assignments")
      .set(authHeader(token))
      .send({ memberId: member.body.data.id, eventId, roleId: role.body.data.id });
    expect(res.status).toBe(403);

    // Suggesting someone who'd just 403 on assignment isn't useful — the
    // suggestions list for this role should already exclude them.
    const suggestions = await request(app)
      .get("/api/volunteers/suggestions")
      .query({ roleId: role.body.data.id, eventId })
      .set(authHeader(token));
    expect(suggestions.status).toBe(200);
    expect(
      suggestions.body.data.suggestions.some((s: { member: { id: string } }) => s.member.id === member.body.data.id),
    ).toBe(false);
  });

  it("blocks assigning a member without safeguarding clearance to a role that requires it", async () => {
    const token = await loginAs("finance@church.local");

    const member = await request(app)
      .post("/api/members")
      .set(authHeader(token))
      .send({ firstName: "VitestUncleared", lastName: `Fixture-${Date.now()}`, safeguardingCleared: false });
    expect(member.status).toBe(201);
    createdMemberIds.push(member.body.data.id);

    const role = await request(app)
      .post("/api/volunteers/roles")
      .set(authHeader(token))
      .send({ name: `Vitest Clearance Role ${Date.now()}`, requiresSafeguardingClearance: true });
    createdRoleIds.push(role.body.data.id);

    const events = await request(app).get("/api/events").set(authHeader(token));
    const eventId = events.body.data[0]?.id;

    const blocked = await request(app)
      .post("/api/volunteers/assignments")
      .set(authHeader(token))
      .send({ memberId: member.body.data.id, eventId, roleId: role.body.data.id });
    expect(blocked.status).toBe(403);

    // Clearing them should unblock the exact same assignment.
    const cleared = await request(app)
      .patch(`/api/members/${member.body.data.id}`)
      .set(authHeader(token))
      .send({ safeguardingCleared: true });
    expect(cleared.status).toBe(200);

    const allowed = await request(app)
      .post("/api/volunteers/assignments")
      .set(authHeader(token))
      .send({ memberId: member.body.data.id, eventId, roleId: role.body.data.id });
    expect(allowed.status).toBe(201);
    createdAssignmentIds.push(allowed.body.data.id);
  });

  it("DEPT_HEAD cannot delete a volunteer role — only ADMIN can", async () => {
    const deptToken = await loginAs("depthead@church.local");
    const adminToken = await loginAs("admin@church.local");
    const financeToken = await loginAs("finance@church.local");

    const create = await request(app)
      .post("/api/volunteers/roles")
      .set(authHeader(financeToken))
      .send({ name: `Vitest Deletable Role ${Date.now()}` });
    const id = create.body.data.id;

    const blocked = await request(app).delete(`/api/volunteers/roles/${id}`).set(authHeader(deptToken));
    expect(blocked.status).toBe(403);

    const deleted = await request(app).delete(`/api/volunteers/roles/${id}`).set(authHeader(adminToken));
    expect(deleted.status).toBe(200);
  });
});

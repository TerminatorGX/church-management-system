import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { app, loginAs, authHeader } from "../../test/helpers";
import { prisma } from "../../lib/prisma";

describe("events", () => {
  const createdIds: string[] = [];

  afterAll(async () => {
    if (createdIds.length) {
      await prisma.event.deleteMany({ where: { id: { in: createdIds } } });
    }
  });

  it("VIEWER can list events but cannot create one", async () => {
    const token = await loginAs("viewer@church.local");

    const list = await request(app).get("/api/events").set(authHeader(token));
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body.data)).toBe(true);

    const create = await request(app)
      .post("/api/events")
      .set(authHeader(token))
      .send({ name: "Should be blocked", startsAt: new Date().toISOString() });
    expect(create.status).toBe(403);
  });

  it("FINANCE can create and update an event", async () => {
    const token = await loginAs("finance@church.local");

    const create = await request(app)
      .post("/api/events")
      .set(authHeader(token))
      .send({
        name: `Vitest Event ${Date.now()}`,
        type: "SPECIAL_EVENT",
        startsAt: new Date(Date.now() + 86_400_000).toISOString(),
      });
    expect(create.status).toBe(201);
    createdIds.push(create.body.data.id);

    const update = await request(app)
      .patch(`/api/events/${create.body.data.id}`)
      .set(authHeader(token))
      .send({ location: "Main hall" });
    expect(update.status).toBe(200);
    expect(update.body.data.location).toBe("Main hall");
  });

  it("accepts an optional capacity, for events where seating is actually limited", async () => {
    const token = await loginAs("finance@church.local");
    const create = await request(app)
      .post("/api/events")
      .set(authHeader(token))
      .send({
        name: `Vitest Conference ${Date.now()}`,
        type: "CONFERENCE",
        startsAt: new Date(Date.now() + 86_400_000).toISOString(),
        capacity: 150,
      });
    expect(create.status).toBe(201);
    createdIds.push(create.body.data.id);
    expect(create.body.data.capacity).toBe(150);

    // A regular Sunday service just leaves it unset.
    const noCapacity = await request(app)
      .post("/api/events")
      .set(authHeader(token))
      .send({ name: `Vitest Sunday ${Date.now()}`, startsAt: new Date(Date.now() + 86_400_000).toISOString() });
    expect(noCapacity.status).toBe(201);
    createdIds.push(noCapacity.body.data.id);
    expect(noCapacity.body.data.capacity).toBeNull();
  });

  it("rejects an event whose end time is before its start time", async () => {
    const token = await loginAs("finance@church.local");
    const startsAt = new Date(Date.now() + 86_400_000);
    const endsAt = new Date(startsAt.getTime() - 3_600_000);

    const res = await request(app)
      .post("/api/events")
      .set(authHeader(token))
      .send({ name: "Bad timing", startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() });
    expect(res.status).toBe(400);
  });

  it("only ADMIN can delete an event, not FINANCE", async () => {
    const financeToken = await loginAs("finance@church.local");
    const adminToken = await loginAs("admin@church.local");

    const create = await request(app)
      .post("/api/events")
      .set(authHeader(financeToken))
      .send({ name: `Vitest Deletable ${Date.now()}`, startsAt: new Date(Date.now() + 86_400_000).toISOString() });
    expect(create.status).toBe(201);
    const id = create.body.data.id;

    const blocked = await request(app).delete(`/api/events/${id}`).set(authHeader(financeToken));
    expect(blocked.status).toBe(403);

    const deleted = await request(app).delete(`/api/events/${id}`).set(authHeader(adminToken));
    expect(deleted.status).toBe(200);
  });
});

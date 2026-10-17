import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { app, loginAs, authHeader } from "../../test/helpers";
import { prisma } from "../../lib/prisma";

describe("families", () => {
  const createdIds: string[] = [];

  afterAll(async () => {
    if (createdIds.length) {
      await prisma.family.deleteMany({ where: { id: { in: createdIds } } });
    }
  });

  it("VIEWER can list families but cannot create one", async () => {
    const token = await loginAs("viewer@church.local");

    const list = await request(app).get("/api/families").set(authHeader(token));
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body.data)).toBe(true);

    const create = await request(app)
      .post("/api/families")
      .set(authHeader(token))
      .send({ familyName: "Should be blocked" });
    expect(create.status).toBe(403);
  });

  it("DEPT_HEAD can create and update a family", async () => {
    const token = await loginAs("depthead@church.local");

    const create = await request(app)
      .post("/api/families")
      .set(authHeader(token))
      .send({ familyName: `Vitest Family ${Date.now()}` });
    expect(create.status).toBe(201);
    createdIds.push(create.body.data.id);

    const update = await request(app)
      .patch(`/api/families/${create.body.data.id}`)
      .set(authHeader(token))
      .send({ city: "Lusaka" });
    expect(update.status).toBe(200);
    expect(update.body.data.city).toBe("Lusaka");
  });

  it("rejects a family with no name", async () => {
    const token = await loginAs("depthead@church.local");
    const res = await request(app).post("/api/families").set(authHeader(token)).send({});
    expect(res.status).toBe(400);
  });

  it("refuses to delete a family that still has members", async () => {
    const token = await loginAs("admin@church.local");
    const list = await request(app)
      .get("/api/families")
      .query({ pageSize: 50 })
      .set(authHeader(token));
    const withMembers = list.body.data.find((f: { _count: { members: number } }) => f._count.members > 0);
    expect(withMembers).toBeTruthy();

    const res = await request(app).delete(`/api/families/${withMembers.id}`).set(authHeader(token));
    expect(res.status).toBe(400);
  });

  it("DEPT_HEAD cannot delete a family — only ADMIN can", async () => {
    const deptToken = await loginAs("depthead@church.local");
    const adminToken = await loginAs("admin@church.local");

    const create = await request(app)
      .post("/api/families")
      .set(authHeader(deptToken))
      .send({ familyName: `Vitest Deletable ${Date.now()}` });
    const id = create.body.data.id;

    const blocked = await request(app).delete(`/api/families/${id}`).set(authHeader(deptToken));
    expect(blocked.status).toBe(403);

    const deleted = await request(app).delete(`/api/families/${id}`).set(authHeader(adminToken));
    expect(deleted.status).toBe(200);
  });

  it("normalises a Zambian phone number and rejects an invalid one", async () => {
    const token = await loginAs("depthead@church.local");

    const create = await request(app)
      .post("/api/families")
      .set(authHeader(token))
      .send({ familyName: `Vitest Phone ${Date.now()}`, phone: "260-97-123-4567" });
    expect(create.status).toBe(201);
    createdIds.push(create.body.data.id);
    expect(create.body.data.phone).toBe("+260971234567");

    const rejected = await request(app)
      .post("/api/families")
      .set(authHeader(token))
      .send({ familyName: `Vitest Bad Phone ${Date.now()}`, phone: "07123" });
    expect(rejected.status).toBe(400);
  });
});

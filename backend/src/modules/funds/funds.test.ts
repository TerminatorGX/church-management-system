import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { app, loginAs, authHeader } from "../../test/helpers";
import { prisma } from "../../lib/prisma";

describe("funds", () => {
  const createdIds: string[] = [];

  afterAll(async () => {
    if (createdIds.length) {
      await prisma.fund.deleteMany({ where: { id: { in: createdIds } } });
    }
  });

  it("DEPT_HEAD cannot access funds at all — the whole module is FINANCE/ADMIN only", async () => {
    const token = await loginAs("depthead@church.local");
    const res = await request(app).get("/api/funds").set(authHeader(token));
    expect(res.status).toBe(403);
  });

  it("FINANCE can create, list, and update a fund", async () => {
    const token = await loginAs("finance@church.local");

    const create = await request(app)
      .post("/api/funds")
      .set(authHeader(token))
      .send({ name: `Vitest Fund ${Date.now()}` });
    expect(create.status).toBe(201);
    createdIds.push(create.body.data.id);

    const list = await request(app).get("/api/funds").set(authHeader(token));
    expect(list.status).toBe(200);
    expect(list.body.data.some((f: { id: string }) => f.id === create.body.data.id)).toBe(true);

    const update = await request(app)
      .patch(`/api/funds/${create.body.data.id}`)
      .set(authHeader(token))
      .send({ description: "A test fund" });
    expect(update.status).toBe(200);
    expect(update.body.data.description).toBe("A test fund");
  });

  it("rejects a fund with no name", async () => {
    const token = await loginAs("finance@church.local");
    const res = await request(app).post("/api/funds").set(authHeader(token)).send({});
    expect(res.status).toBe(400);
  });

  it("FINANCE cannot delete a fund — only ADMIN can", async () => {
    const financeToken = await loginAs("finance@church.local");
    const adminToken = await loginAs("admin@church.local");

    const create = await request(app)
      .post("/api/funds")
      .set(authHeader(financeToken))
      .send({ name: `Vitest Deletable ${Date.now()}` });
    const id = create.body.data.id;

    const blocked = await request(app).delete(`/api/funds/${id}`).set(authHeader(financeToken));
    expect(blocked.status).toBe(403);

    const deleted = await request(app).delete(`/api/funds/${id}`).set(authHeader(adminToken));
    expect(deleted.status).toBe(200);
  });
});

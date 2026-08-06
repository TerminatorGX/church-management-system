import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { app, loginAs, authHeader } from "../../test/helpers";
import { prisma } from "../../lib/prisma";

describe("members", () => {
  const createdIds: string[] = [];

  afterAll(async () => {
    if (createdIds.length) {
      await prisma.member.deleteMany({ where: { id: { in: createdIds } } });
    }
  });

  it("VIEWER can list members but cannot create one", async () => {
    const token = await loginAs("viewer@church.local");

    const list = await request(app).get("/api/members").set(authHeader(token));
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body.data)).toBe(true);

    const create = await request(app)
      .post("/api/members")
      .set(authHeader(token))
      .send({ firstName: "Should", lastName: "BeBlocked" });
    expect(create.status).toBe(403);
  });

  it("FINANCE can create a member and read it back", async () => {
    const token = await loginAs("finance@church.local");

    const create = await request(app)
      .post("/api/members")
      .set(authHeader(token))
      .send({ firstName: "VitestFixture", lastName: `Member-${Date.now()}` });
    expect(create.status).toBe(201);
    createdIds.push(create.body.data.id);

    const get = await request(app).get(`/api/members/${create.body.data.id}`).set(authHeader(token));
    expect(get.status).toBe(200);
    expect(get.body.data.firstName).toBe("VitestFixture");
    expect(get.body.data.isActive).toBe(true);
  });

  it("rejects a member with no last name", async () => {
    const token = await loginAs("finance@church.local");
    const res = await request(app)
      .post("/api/members")
      .set(authHeader(token))
      .send({ firstName: "OnlyFirstName" });
    expect(res.status).toBe(400);
  });
});

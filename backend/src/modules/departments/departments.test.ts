import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { app, loginAs, authHeader } from "../../test/helpers";
import { prisma } from "../../lib/prisma";

describe("departments", () => {
  const createdIds: string[] = [];

  afterAll(async () => {
    if (createdIds.length) {
      await prisma.department.deleteMany({ where: { id: { in: createdIds } } });
    }
  });

  it("any authenticated role can list departments", async () => {
    const token = await loginAs("viewer@church.local");
    const res = await request(app).get("/api/departments").set(authHeader(token));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it("FINANCE cannot create a department — only ADMIN can", async () => {
    const token = await loginAs("finance@church.local");
    const res = await request(app)
      .post("/api/departments")
      .set(authHeader(token))
      .send({ name: "Should be blocked" });
    expect(res.status).toBe(403);
  });

  it("ADMIN can create and update a department", async () => {
    const token = await loginAs("admin@church.local");

    const create = await request(app)
      .post("/api/departments")
      .set(authHeader(token))
      .send({ name: `Vitest Dept ${Date.now()}` });
    expect(create.status).toBe(201);
    createdIds.push(create.body.data.id);

    const update = await request(app)
      .patch(`/api/departments/${create.body.data.id}`)
      .set(authHeader(token))
      .send({ description: "A test ministry" });
    expect(update.status).toBe(200);
    expect(update.body.data.description).toBe("A test ministry");
  });

  it("rejects a department with no name", async () => {
    const token = await loginAs("admin@church.local");
    const res = await request(app).post("/api/departments").set(authHeader(token)).send({});
    expect(res.status).toBe(400);
  });
});

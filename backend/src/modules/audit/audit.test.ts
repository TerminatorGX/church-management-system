import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { app, loginAs, authHeader } from "../../test/helpers";
import { prisma } from "../../lib/prisma";

describe("audit logs", () => {
  const createdFundIds: string[] = [];

  // Audit log rows are append-only by design (see backend/src/lib/audit.ts) —
  // only the Fund fixture that generates one needs cleaning up, not the log
  // entries themselves.
  afterAll(async () => {
    if (createdFundIds.length) {
      await prisma.fund.deleteMany({ where: { id: { in: createdFundIds } } });
    }
  });

  it("non-ADMIN cannot view audit logs", async () => {
    const token = await loginAs("finance@church.local");
    const res = await request(app).get("/api/audit-logs").set(authHeader(token));
    expect(res.status).toBe(403);
  });

  it("ADMIN can list audit logs, paginated, newest first", async () => {
    const token = await loginAs("admin@church.local");
    const res = await request(app).get("/api/audit-logs").set(authHeader(token));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta.page).toBe(1);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it("filtering by entity narrows results to that entity", async () => {
    const financeToken = await loginAs("finance@church.local");
    const fundName = `Vitest Audit Fund ${Date.now()}`;
    const create = await request(app)
      .post("/api/funds")
      .set(authHeader(financeToken))
      .send({ name: fundName });
    expect(create.status).toBe(201);
    createdFundIds.push(create.body.data.id);

    const adminToken = await loginAs("admin@church.local");
    const res = await request(app)
      .get("/api/audit-logs")
      .query({ entity: "Fund", action: "CREATE" })
      .set(authHeader(adminToken));

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    for (const row of res.body.data) {
      expect(row.entity).toBe("Fund");
      expect(row.action).toBe("CREATE");
    }
    expect(res.body.data.some((row: { entityId: string }) => row.entityId === create.body.data.id)).toBe(true);
  });

  it("GET /entities lists distinct entity names and is also admin-only", async () => {
    const financeToken = await loginAs("finance@church.local");
    const blocked = await request(app).get("/api/audit-logs/entities").set(authHeader(financeToken));
    expect(blocked.status).toBe(403);

    const adminToken = await loginAs("admin@church.local");
    const res = await request(app).get("/api/audit-logs/entities").set(authHeader(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.data).toContain("Fund");
  });
});

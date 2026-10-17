import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { app, loginAs, authHeader } from "../../test/helpers";
import { prisma } from "../../lib/prisma";

describe("contributions", () => {
  const createdIds: string[] = [];

  afterAll(async () => {
    if (createdIds.length) {
      await prisma.contribution.deleteMany({ where: { id: { in: createdIds } } });
    }
  });

  it("DEPT_HEAD cannot see the giving ledger", async () => {
    const token = await loginAs("depthead@church.local");
    const res = await request(app).get("/api/contributions").set(authHeader(token));
    expect(res.status).toBe(403);
  });

  it("FINANCE can record a contribution and gets a well-formed, unique receipt number", async () => {
    const token = await loginAs("finance@church.local");

    const funds = await request(app).get("/api/funds").set(authHeader(token));
    const fundId = funds.body.data[0]?.id;
    expect(fundId).toBeTruthy();

    const create = await request(app)
      .post("/api/contributions")
      .set(authHeader(token))
      .send({
        amount: 42.5,
        fundId,
        receivedOn: new Date().toISOString().slice(0, 10),
        paymentMethod: "CASH",
      });

    expect(create.status).toBe(201);
    expect(create.body.data.receiptNumber).toMatch(/^RCT-\d{4}-\d{6}$/);
    expect(create.body.data.amount).toBe("42.5");
    createdIds.push(create.body.data.id);
  });

  it("rejects a contribution with a zero or negative amount", async () => {
    const token = await loginAs("finance@church.local");
    const funds = await request(app).get("/api/funds").set(authHeader(token));
    const fundId = funds.body.data[0]?.id;

    const res = await request(app)
      .post("/api/contributions")
      .set(authHeader(token))
      .send({ amount: 0, fundId, receivedOn: new Date().toISOString().slice(0, 10) });
    expect(res.status).toBe(400);
  });

  it("rejects a contribution dated in the future", async () => {
    const token = await loginAs("finance@church.local");
    const funds = await request(app).get("/api/funds").set(authHeader(token));
    const fundId = funds.body.data[0]?.id;

    const nextWeek = new Date(Date.now() + 7 * 86_400_000);
    const res = await request(app)
      .post("/api/contributions")
      .set(authHeader(token))
      .send({ amount: 10, fundId, receivedOn: nextWeek.toISOString().slice(0, 10) });
    expect(res.status).toBe(400);
  });
});

import { describe, it, expect } from "vitest";
import request from "supertest";
import { app, loginAs, authHeader } from "../../test/helpers";

describe("dashboard", () => {
  it("requires authentication", async () => {
    const res = await request(app).get("/api/dashboard/summary");
    expect(res.status).toBe(401);
  });

  it("summary omits finance figures for VIEWER but includes them for FINANCE", async () => {
    const viewerToken = await loginAs("viewer@church.local");
    const viewerRes = await request(app).get("/api/dashboard/summary").set(authHeader(viewerToken));
    expect(viewerRes.status).toBe(200);
    expect(viewerRes.body.data.finance).toBeNull();
    expect(typeof viewerRes.body.data.activeMembers).toBe("number");

    const financeToken = await loginAs("finance@church.local");
    const financeRes = await request(app).get("/api/dashboard/summary").set(authHeader(financeToken));
    expect(financeRes.status).toBe(200);
    expect(financeRes.body.data.finance).not.toBeNull();
    expect(typeof financeRes.body.data.finance.thisMonth).toBe("string");
  });

  it("attendance-trend and membership-growth return arrays sized to the months param", async () => {
    const token = await loginAs("viewer@church.local");

    const attendance = await request(app)
      .get("/api/dashboard/attendance-trend")
      .query({ months: 3 })
      .set(authHeader(token));
    expect(attendance.status).toBe(200);
    expect(Array.isArray(attendance.body.data)).toBe(true);

    const growth = await request(app)
      .get("/api/dashboard/membership-growth")
      .query({ months: 3 })
      .set(authHeader(token));
    expect(growth.status).toBe(200);
    expect(growth.body.data).toHaveLength(3);
  });

  it("giving-trend and giving-by-fund are restricted for VIEWER but populated for FINANCE", async () => {
    const viewerToken = await loginAs("viewer@church.local");
    const viewerTrend = await request(app)
      .get("/api/dashboard/giving-trend")
      .set(authHeader(viewerToken));
    expect(viewerTrend.status).toBe(200);
    expect(viewerTrend.body.restricted).toBe(true);
    expect(viewerTrend.body.data).toEqual([]);

    const financeToken = await loginAs("finance@church.local");
    const financeByFund = await request(app)
      .get("/api/dashboard/giving-by-fund")
      .set(authHeader(financeToken));
    expect(financeByFund.status).toBe(200);
    expect(financeByFund.body.restricted).toBe(false);
  });

  it("needs-follow-up and volunteer-coverage return data for any authenticated role", async () => {
    const token = await loginAs("viewer@church.local");

    const followUp = await request(app).get("/api/dashboard/needs-follow-up").set(authHeader(token));
    expect(followUp.status).toBe(200);
    expect(Array.isArray(followUp.body.data)).toBe(true);

    const coverage = await request(app).get("/api/dashboard/volunteer-coverage").set(authHeader(token));
    expect(coverage.status).toBe(200);
    expect(Array.isArray(coverage.body.data)).toBe(true);
  });

  it("report.pdf returns a PDF document", async () => {
    const token = await loginAs("admin@church.local");
    const res = await request(app).get("/api/dashboard/report.pdf").set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/pdf");
  });
});

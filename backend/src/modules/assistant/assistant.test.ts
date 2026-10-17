import { describe, it, expect } from "vitest";
import request from "supertest";
import { app, loginAs, authHeader } from "../../test/helpers";
import { runTool } from "./tools";
import type { AuthedUser } from "../../middleware/auth";

/**
 * These exercise runTool() directly rather than going through POST /ask, so
 * the suite stays fast, deterministic, and independent of GROQ_API_KEY /
 * Groq's free-tier quota. The HTTP-level tests below only check auth/shape.
 */
const userAs = (role: AuthedUser["role"]): AuthedUser => ({
  id: "00000000-0000-0000-0000-000000000001",
  email: "test@church.local",
  name: "Test User",
  role,
  memberId: null,
});

describe("assistant tools (RBAC)", () => {
  it("get_giving_summary is denied to VIEWER and DEPT_HEAD but allowed for FINANCE/ADMIN", async () => {
    const deniedViewer = (await runTool("get_giving_summary", {}, userAs("VIEWER"))) as { error?: string };
    expect(deniedViewer.error).toBeTruthy();

    const deniedDeptHead = (await runTool("get_giving_summary", {}, userAs("DEPT_HEAD"))) as { error?: string };
    expect(deniedDeptHead.error).toBeTruthy();

    const allowed = (await runTool("get_giving_summary", {}, userAs("FINANCE"))) as {
      total?: string;
      error?: string;
    };
    expect(allowed.error).toBeUndefined();
    expect(typeof allowed.total).toBe("string");
  });

  it("get_fund_details is denied to non-finance roles", async () => {
    const denied = (await runTool("get_fund_details", {}, userAs("VIEWER"))) as { error?: string };
    expect(denied.error).toBeTruthy();

    const allowed = (await runTool("get_fund_details", {}, userAs("ADMIN"))) as { funds?: unknown[] };
    expect(Array.isArray(allowed.funds)).toBe(true);
  });

  it("get_church_overview is available to every role and returns headline counts", async () => {
    const result = (await runTool("get_church_overview", {}, userAs("VIEWER"))) as {
      activeMembers: number;
      families: number;
    };
    expect(typeof result.activeMembers).toBe("number");
    expect(typeof result.families).toBe("number");
  });

  it("search_members returns a well-shaped result", async () => {
    const result = (await runTool("search_members", { limit: 5 }, userAs("DEPT_HEAD"))) as {
      count: number;
      members: unknown[];
    };
    expect(typeof result.count).toBe("number");
    expect(Array.isArray(result.members)).toBe(true);
  });

  it("returns an error object for an unknown tool name instead of throwing", async () => {
    const result = (await runTool("not_a_real_tool", {}, userAs("ADMIN"))) as { error?: string };
    expect(result.error).toBeTruthy();
  });

  it("list_volunteer_roles is available to every role and reports safeguarding requirements", async () => {
    const result = (await runTool("list_volunteer_roles", {}, userAs("VIEWER"))) as {
      roles: { name: string; minimumAge: number | null; requiresSafeguardingClearance: boolean }[];
    };
    expect(Array.isArray(result.roles)).toBe(true);
    const childrensTeacher = result.roles.find((r) => r.name === "Children's teacher");
    expect(childrensTeacher?.minimumAge).toBe(18);
    expect(childrensTeacher?.requiresSafeguardingClearance).toBe(true);
  });

  it("get_recent_activity is ADMIN-only", async () => {
    const denied = (await runTool("get_recent_activity", {}, userAs("DEPT_HEAD"))) as { error?: string };
    expect(denied.error).toBeTruthy();

    const allowed = (await runTool("get_recent_activity", { limit: 5 }, userAs("ADMIN"))) as {
      entries?: unknown[];
    };
    expect(Array.isArray(allowed.entries)).toBe(true);
  });

  it("get_member_profile includes age and safeguarding clearance", async () => {
    const result = (await runTool("get_member_profile", { query: "Chibesa" }, userAs("ADMIN"))) as {
      age: number | null;
      safeguardingCleared: boolean;
      error?: string;
    };
    expect(result.error).toBeUndefined();
    expect(typeof result.safeguardingCleared).toBe("boolean");
    expect(result.age === null || typeof result.age === "number").toBe(true);
  });
});

describe("assistant routes", () => {
  it("requires authentication", async () => {
    const res = await request(app).get("/api/assistant/conversations");
    expect(res.status).toBe(401);
  });

  it("/status reports whether the assistant is enabled", async () => {
    const token = await loginAs("viewer@church.local");
    const res = await request(app).get("/api/assistant/status").set(authHeader(token));
    expect(res.status).toBe(200);
    expect(typeof res.body.data.enabled).toBe("boolean");
  });

  it("a conversation belonging to another user cannot be read", async () => {
    const token = await loginAs("viewer@church.local");
    const res = await request(app)
      .get("/api/assistant/conversations/00000000-0000-0000-0000-000000000000")
      .set(authHeader(token));
    expect(res.status).toBe(404);
  });
});

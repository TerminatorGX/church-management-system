import { describe, it, expect } from "vitest";
import request from "supertest";
import { app, loginAs, authHeader } from "../../test/helpers";

describe("auth", () => {
  it("logs in with correct credentials and returns a usable token", async () => {
    const token = await loginAs("admin@church.local");
    expect(token).toBeTruthy();

    const me = await request(app).get("/api/auth/me").set(authHeader(token));
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe("admin@church.local");
    expect(me.body.user.role).toBe("ADMIN");
  });

  it("rejects an incorrect password", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@church.local", password: "definitely-the-wrong-password" });
    expect(res.status).toBe(401);
  });

  it("requires a token for /me", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("forgot-password replies with the same generic message for an unknown email", async () => {
    // Deliberately not calling this more than once anywhere in the suite —
    // it shares a tight rate limiter with reset-password.
    const res = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "no-such-person@nowhere.test" });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/if an account exists/i);
  });

  it("reset-password rejects a token that was never issued", async () => {
    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: "0".repeat(64), newPassword: "SomeNewPassword123" });
    expect(res.status).toBe(400);
  });
});

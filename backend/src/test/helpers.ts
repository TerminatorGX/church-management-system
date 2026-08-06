import request from "supertest";
import { createApp } from "../app";

/**
 * One app instance shared by every test file in the run. That also means
 * every rate limiter in the app (login, forgot-password, the assistant) is
 * shared too — see the memoized `loginAs` below, which exists specifically
 * to keep the whole suite comfortably under the login limiter's 10-per-15-min
 * ceiling instead of re-authenticating on every single test.
 */
export const app = createApp();

const DEMO_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "CyberGod565617";
const tokenCache = new Map<string, string>();

/** Logs in as a seeded demo account once per email per test run, then reuses the token. */
export const loginAs = async (email: string): Promise<string> => {
  const cached = tokenCache.get(email);
  if (cached) return cached;

  const res = await request(app).post("/api/auth/login").send({ email, password: DEMO_PASSWORD });
  if (res.status !== 200) {
    throw new Error(
      `Test login failed for ${email} (${res.status}): ${JSON.stringify(res.body)}. ` +
        "These tests expect the seeded demo accounts to exist with SEED_ADMIN_PASSWORD from backend/.env — run `npm run seed` first.",
    );
  }

  tokenCache.set(email, res.body.token as string);
  return res.body.token as string;
};

export const authHeader = (token: string) => ({ Authorization: `Bearer ${token}` });

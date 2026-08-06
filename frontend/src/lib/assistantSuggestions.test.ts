import { describe, it, expect } from "vitest";
import { getSuggestions } from "./assistantSuggestions";

describe("getSuggestions", () => {
  it("returns the general set for an unmapped route", () => {
    const result = getSuggestions("/", true);
    expect(result.length).toBeGreaterThan(0);
    expect(result.length).toBeLessThanOrEqual(4);
  });

  it("returns member-flavoured questions on the members page", () => {
    const result = getSuggestions("/members", true);
    expect(result.some((q) => /keyboard|sing/i.test(q))).toBe(true);
  });

  it("returns volunteer-flavoured questions on the volunteers page", () => {
    const result = getSuggestions("/volunteers", true);
    expect(result.some((q) => /volunteer slots/i.test(q))).toBe(true);
  });

  it("suggests finance questions on the contributions page for a finance-capable role", () => {
    const result = getSuggestions("/contributions", true);
    expect(result.some((q) => /given|giving|fund/i.test(q))).toBe(true);
  });

  it("never suggests a finance question to a role that can't see giving data", () => {
    const forbidden = /given|giving|fund|contribution/i;

    for (const path of ["/", "/members", "/events", "/attendance", "/volunteers", "/contributions", "/funds"]) {
      const result = getSuggestions(path, false);
      for (const question of result) {
        expect(question).not.toMatch(forbidden);
      }
    }
  });

  it("always returns at least one suggestion, even with finance filtered out", () => {
    const result = getSuggestions("/contributions", false);
    expect(result.length).toBeGreaterThan(0);
  });
});

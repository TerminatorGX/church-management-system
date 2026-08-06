import { describe, it, expect } from "vitest";
import { fmtCompact, fmtDate, fmtMoney, fullName, initials, titleCase, toDateInput } from "./format";

describe("fmtMoney", () => {
  it("formats a numeric string with the currency prefix and two decimals", () => {
    expect(fmtMoney("1234.5")).toBe("ZMW 1,234.50");
  });

  it("defaults a missing value to zero rather than throwing", () => {
    expect(fmtMoney(null)).toBe("ZMW 0.00");
    expect(fmtMoney(undefined)).toBe("ZMW 0.00");
  });

  it("supports a different currency label", () => {
    expect(fmtMoney(10, "USD")).toBe("USD 10.00");
  });
});

describe("fmtCompact", () => {
  it("abbreviates thousands and millions", () => {
    expect(fmtCompact(950)).toBe("950");
    expect(fmtCompact(12400)).toBe("12.4k");
    expect(fmtCompact(3_200_000)).toBe("3.2M");
  });
});

describe("titleCase", () => {
  it("converts SCREAMING_SNAKE enum values into readable text", () => {
    expect(titleCase("SUNDAY_SERVICE")).toBe("Sunday Service");
    expect(titleCase("PRESENT")).toBe("Present");
  });
});

describe("initials / fullName", () => {
  it("builds initials from first and last name", () => {
    expect(initials("Grace", "Mwale")).toBe("GM");
  });

  it("joins first and last name", () => {
    expect(fullName({ firstName: "Joseph", lastName: "Banda" })).toBe("Joseph Banda");
  });
});

describe("fmtDate / toDateInput", () => {
  it("formats an ISO date string", () => {
    expect(fmtDate("2026-03-15")).toBe("15 Mar 2026");
  });

  it("falls back for a missing or invalid date", () => {
    expect(fmtDate(null)).toBe("—");
    expect(fmtDate("not-a-date")).toBe("—");
  });

  it("round-trips a date into <input type=date> format", () => {
    // Date-only (no time component) so this can't drift a day under a
    // different timezone on whichever machine runs the suite.
    expect(toDateInput("2026-03-15")).toBe("2026-03-15");
  });
});

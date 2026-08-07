import { describe, expect, it } from "vitest";
import { dateOnlyToDate, dateToDateOnly } from "./dates";

describe("dateOnlyToDate / dateToDateOnly", () => {
  it("round-trips a date-only string without shifting the day", () => {
    const date = dateOnlyToDate("2000-05-01");

    expect(date).not.toBeNull();
    expect(date!.getFullYear()).toBe(2000);
    expect(date!.getMonth()).toBe(4);
    expect(date!.getDate()).toBe(1);
    expect(dateToDateOnly(date)).toBe("2000-05-01");
  });

  it("never produces the UTC-shifted day new Date(string)/toISOString() would", () => {
    // new Date("2000-05-01") parses as UTC midnight — late evening of
    // 2000-04-30 in any timezone behind UTC. That's the exact bug these
    // helpers exist to avoid.
    const date = dateOnlyToDate("2000-05-01");
    expect(dateToDateOnly(date)).toBe("2000-05-01");
    expect(dateToDateOnly(date)).not.toBe("2000-04-30");
  });

  it("pads single-digit months and days", () => {
    const date = new Date(2001, 0, 5);
    expect(dateToDateOnly(date)).toBe("2001-01-05");
  });

  it("returns null for missing input", () => {
    expect(dateOnlyToDate(null)).toBeNull();
    expect(dateOnlyToDate(undefined)).toBeNull();
    expect(dateOnlyToDate("")).toBeNull();
    expect(dateToDateOnly(null)).toBeNull();
    expect(dateToDateOnly(undefined)).toBeNull();
  });
});

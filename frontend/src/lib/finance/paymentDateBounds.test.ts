import { describe, expect, it } from "vitest";
import { PaymentDateBounds } from "./paymentDateBounds";

function isWithin(instant: string, from: string, to: string): boolean {
  const moment: number = new Date(instant).getTime();
  return moment >= new Date(from).getTime() && moment <= new Date(to).getTime();
}

describe("payment date bounds", () => {
  it("converts an inclusive Dushanbe day to the exact datetime bounds the endpoint compares against", () => {
    const filters = PaymentDateBounds.toFilters({ from: "2026-10-31", to: "2026-10-31" });
    expect(filters).toEqual({ dateFrom: "2026-10-31T00:00:00+05:00", dateTo: "2026-10-31T23:59:59.999999+05:00" });
    expect(new Date(filters.dateFrom as string).toISOString()).toBe("2026-10-30T19:00:00.000Z");
  });

  it("includes the whole first and last Dushanbe day and excludes the neighbouring instants", () => {
    const { dateFrom, dateTo } = PaymentDateBounds.toFilters({ from: "2026-10-01", to: "2026-10-31" });
    expect(isWithin("2026-09-30T19:00:00Z", dateFrom as string, dateTo as string)).toBe(true);
    expect(isWithin("2026-09-30T18:59:59Z", dateFrom as string, dateTo as string)).toBe(false);
    expect(isWithin("2026-10-31T18:59:59Z", dateFrom as string, dateTo as string)).toBe(true);
    expect(isWithin("2026-10-31T19:00:00Z", dateFrom as string, dateTo as string)).toBe(false);
  });

  it("crosses month and year boundaries without device-timezone drift", () => {
    expect(PaymentDateBounds.startOfDay("2027-01-01")).toBe("2027-01-01T00:00:00+05:00");
    expect(PaymentDateBounds.endOfDay("2026-12-31")).toBe("2026-12-31T23:59:59.999999+05:00");
  });

  it("serializes only the bounds that are set", () => {
    expect(PaymentDateBounds.toFilters({ from: "2026-10-05", to: null })).toEqual({ dateFrom: "2026-10-05T00:00:00+05:00" });
    expect(PaymentDateBounds.toFilters({ from: null, to: "2026-10-05" })).toEqual({ dateTo: "2026-10-05T23:59:59.999999+05:00" });
    expect(PaymentDateBounds.toFilters({ from: null, to: null })).toEqual({});
  });
});

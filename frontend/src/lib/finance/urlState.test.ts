import { describe, expect, it } from "vitest";
import { FinanceUrlState } from "./urlState";

function parse(query: string) {
  return FinanceUrlState.parse(new URLSearchParams(query));
}

describe("finance URL schema", () => {
  it("defaults to the overview with no filters", () => {
    const state = parse("");
    expect(state.tab).toBe("overview");
    expect(state.range).toBeNull();
    expect(state.debtors).toEqual({ page: 1, courseId: null, overdueDays: null, enrollmentStatus: null });
    expect(state.payments).toEqual({ page: 1, courseId: null, method: null });
  });

  it("ignores unknown tabs, enums, non-positive ids and malformed pages", () => {
    const state = parse("tab=audit&dpage=0&dcourse=-3&doverdue=abc&dstatus=deleted&ppage=1.5&pcourse=x&pmethod=card&student_id=7&unknown=1");
    expect(state.tab).toBe("overview");
    expect(state.debtors).toEqual({ page: 1, courseId: null, overdueDays: null, enrollmentStatus: null });
    expect(state.payments).toEqual({ page: 1, courseId: null, method: null });
  });

  it("drops inverted, incomplete and impossible ranges", () => {
    expect(parse("from=2026-10-20&to=2026-10-01").range).toBeNull();
    expect(parse("from=2026-10-01").range).toBeNull();
    expect(parse("from=2026-02-30&to=2026-03-01").range).toBeNull();
    expect(parse("from=2026-10-01&to=2026-10-20").range).toEqual({ from: "2026-10-01", to: "2026-10-20" });
  });

  it("round-trips every supported parameter for each registry independently", () => {
    const query = "tab=debtors&from=2026-09-01&to=2026-09-30&dpage=3&dcourse=12&doverdue=30&dstatus=active&ppage=2&pcourse=5&pmethod=cash";
    const state = parse(query);
    expect(Object.fromEntries(FinanceUrlState.serialize(state))).toEqual(Object.fromEntries(new URLSearchParams(query)));
  });

  it("serializes only the owning endpoint's supported parameters and never a student id", () => {
    const debtFilters = FinanceUrlState.debtFilters(parse("dcourse=12&doverdue=30&dstatus=active&student_id=9").debtors);
    expect(Object.keys(debtFilters).sort()).toEqual(["courseId", "enrollmentStatus", "overdueDays"]);
    expect(FinanceUrlState.paymentFilters(parse("pcourse=5&pmethod=cash").payments)).toEqual({ courseId: 5, method: "cash" });
  });

  it("builds the attention handoff with a validated course only", () => {
    expect(FinanceUrlState.debtorsLocation(11)).toBe("/finance?tab=debtors&dcourse=11");
    expect(FinanceUrlState.debtorsLocation()).toBe("/finance?tab=debtors");
    expect(FinanceUrlState.debtorsLocation(-4)).toBe("/finance?tab=debtors");
    expect(FinanceUrlState.debtorsLocation(1.5)).toBe("/finance?tab=debtors");
  });

  it("classifies range problems before any query", () => {
    expect(FinanceUrlState.rangeProblem("", "2026-10-01")).toBe("incomplete");
    expect(FinanceUrlState.rangeProblem("2026-10-02", "2026-10-01")).toBe("inverted");
    expect(FinanceUrlState.rangeProblem("2026-13-01", "2026-10-01")).toBe("invalid");
    expect(FinanceUrlState.rangeProblem("2026-10-01", "2026-10-01")).toBeNull();
  });

  it("builds school-calendar presets including the January rollover", () => {
    const reference = new Date("2026-01-15T10:00:00Z");
    expect(FinanceUrlState.presetRange("thisMonth", reference)).toEqual({ from: "2026-01-01", to: "2026-01-31" });
    expect(FinanceUrlState.presetRange("lastMonth", reference)).toEqual({ from: "2025-12-01", to: "2025-12-31" });
    expect(FinanceUrlState.presetRange("thisYear", reference)).toEqual({ from: "2026-01-01", to: "2026-12-31" });
    expect(FinanceUrlState.presetRange("lastMonth", new Date("2026-03-10T10:00:00Z"))).toEqual({ from: "2026-02-01", to: "2026-02-28" });
  });

  it("recognises whole calendar months for the compact period label", () => {
    expect(FinanceUrlState.isWholeMonth({ from: "2026-02-01", to: "2026-02-28" })).toBe(true);
    expect(FinanceUrlState.isWholeMonth({ from: "2026-02-01", to: "2026-02-27" })).toBe(false);
    expect(FinanceUrlState.isWholeMonth({ from: "2026-02-02", to: "2026-02-28" })).toBe(false);
  });
});

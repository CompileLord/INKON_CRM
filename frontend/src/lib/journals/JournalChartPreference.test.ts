import { afterEach, describe, expect, it, vi } from "vitest";
import { JournalChartPreference } from "./JournalChartPreference";

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("JournalChartPreference", () => {
  it("round-trips the collapsed state", () => {
    expect(JournalChartPreference.readCollapsed()).toBe(false);
    JournalChartPreference.writeCollapsed(true);
    expect(JournalChartPreference.readCollapsed()).toBe(true);
    JournalChartPreference.writeCollapsed(false);
    expect(JournalChartPreference.readCollapsed()).toBe(false);
  });

  it("falls back to expanded and swallows errors when storage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(JournalChartPreference.readCollapsed()).toBe(false);
    expect(() => JournalChartPreference.writeCollapsed(true)).not.toThrow();
  });
});

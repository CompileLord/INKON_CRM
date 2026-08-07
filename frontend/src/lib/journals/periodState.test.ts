import { describe, expect, it } from "vitest";

export function derivePeriodState(filled: number, expected: number, startDate: string, today: string): "upcoming" | "empty" | "partial" | "complete" {
  if (startDate > today) return "upcoming";
  if (filled === 0) return "empty";
  if (filled >= expected) return "complete";
  return "partial";
}

describe("Period State Classifier", () => {
  it("classifies future period as upcoming", () => {
    expect(derivePeriodState(0, 20, "2026-12-01", "2026-08-05")).toBe("upcoming");
  });

  it("classifies past or current period with 0 filled cells as empty", () => {
    expect(derivePeriodState(0, 20, "2026-08-01", "2026-08-05")).toBe("empty");
  });

  it("classifies partially filled period as partial", () => {
    expect(derivePeriodState(10, 20, "2026-08-01", "2026-08-05")).toBe("partial");
  });

  it("classifies fully filled period as complete", () => {
    expect(derivePeriodState(20, 20, "2026-08-01", "2026-08-05")).toBe("complete");
  });
});

import { describe, expect, it } from "vitest";
import { JournalScoringRules } from "./JournalScoringRules";

describe("JournalScoringRules.maximumPeriodScore", () => {
  it("adds homework, attendance, exam and bonus maxima", () => {
    expect(JournalScoringRules.maximumPeriodScore(5, 70, 20)).toBe(120);
    expect(JournalScoringRules.maximumPeriodScore(12, 60, 35)).toBe(167);
  });

  it("falls back to the default bonus maximum of 20", () => {
    expect(JournalScoringRules.maximumPeriodScore(1, 70)).toBe(96);
  });
});

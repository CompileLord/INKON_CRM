import { describe, expect, it } from "vitest";
import { JournalEntryCommands, JournalSummaryCommands, type JournalEntryValue } from "./journalCommands";

const absentWithComment: JournalEntryValue = { attendance: false, score: 0, comment: "Late bus" };
const presentGraded: JournalEntryValue = { attendance: true, score: 4, comment: "Good work" };

describe("JournalEntryCommands", () => {
  it.each([1, 2, 3, 4, 5])("score %i implies present", (score) => {
    expect(JournalEntryCommands.apply(absentWithComment, { kind: "score", score })).toEqual({
      attendance: true,
      score,
      comment: "Late bus",
    });
  });

  it("score 0 keeps attendance in both directions", () => {
    expect(JournalEntryCommands.apply(presentGraded, { kind: "score", score: 0 }).attendance).toBe(true);
    expect(JournalEntryCommands.apply(absentWithComment, { kind: "score", score: 0 }).attendance).toBe(false);
  });

  it("explicit absence sets attendance false and score 0 regardless of the previous grade", () => {
    expect(JournalEntryCommands.apply(presentGraded, { kind: "attendance", attended: false })).toEqual({
      attendance: false,
      score: 0,
      comment: "Good work",
    });
  });

  it("marking present keeps the existing score", () => {
    expect(JournalEntryCommands.apply({ attendance: false, score: 0, comment: null }, { kind: "attendance", attended: true })).toEqual({
      attendance: true,
      score: 0,
      comment: null,
    });
  });

  it("carries the current comment through grade and attendance changes", () => {
    expect(JournalEntryCommands.apply(presentGraded, { kind: "score", score: 2 }).comment).toBe("Good work");
    expect(JournalEntryCommands.apply(presentGraded, { kind: "attendance", attended: false }).comment).toBe("Good work");
  });

  it("trims a saved comment and clears it when empty", () => {
    expect(JournalEntryCommands.apply(presentGraded, { kind: "comment", comment: "  Better  " }).comment).toBe("Better");
    expect(JournalEntryCommands.apply(presentGraded, { kind: "comment", comment: "   " }).comment).toBeNull();
    expect(JournalEntryCommands.apply(presentGraded, { kind: "comment", comment: null }).comment).toBeNull();
  });

  it("ignores an out-of-range or fractional score", () => {
    expect(JournalEntryCommands.apply(presentGraded, { kind: "score", score: 6 })).toBe(presentGraded);
    expect(JournalEntryCommands.apply(presentGraded, { kind: "score", score: -1 })).toBe(presentGraded);
    expect(JournalEntryCommands.apply(presentGraded, { kind: "score", score: 2.5 })).toBe(presentGraded);
  });

  it("keeps the comment of the legacy patch when it is omitted", () => {
    expect(JournalEntryCommands.fromLegacyPatch(presentGraded, { attendance: true, score: 3 }).comment).toBe("Good work");
    expect(JournalEntryCommands.fromLegacyPatch(presentGraded, { attendance: true, score: 3, comment: null }).comment).toBeNull();
  });
});

describe("JournalSummaryCommands.judgeInput", () => {
  it("accepts whole numbers including zero", () => {
    expect(JournalSummaryCommands.judgeInput("0", "bonus_score", 100)).toEqual({ valid: true, value: 0 });
    expect(JournalSummaryCommands.judgeInput(" 17 ", "exam_score", 100)).toEqual({ valid: true, value: 17 });
  });

  it.each(["", "   ", "abc", "1.5", "-3", "1e3", "٣", "12a", "+4"])("never coerces %j to zero", (raw) => {
    const verdict = JournalSummaryCommands.judgeInput(raw, "bonus_score", 100);
    expect(verdict.valid).toBe(false);
  });

  it("reports the empty and non-integer reasons separately", () => {
    expect(JournalSummaryCommands.judgeInput("", "bonus_score", 100)).toEqual({ valid: false, reason: "empty" });
    expect(JournalSummaryCommands.judgeInput("1.5", "bonus_score", 100)).toEqual({ valid: false, reason: "notWholeNumber" });
  });

  it("rejects a bonus above the verified server limit of 20 rather than clamping it", () => {
    expect(JournalSummaryCommands.judgeInput("21", "bonus_score", 100)).toEqual({ valid: false, reason: "aboveMaximum", maximum: 20 });
    expect(JournalSummaryCommands.judgeInput("20", "bonus_score", 100)).toEqual({ valid: true, value: 20 });
  });

  it("judges the paired draft as valid only when both fields are valid and never zeroes either", () => {
    expect(JournalSummaryCommands.judgePair("5", "40", 100).isValid).toBe(true);
    expect(JournalSummaryCommands.judgePair("", "40", 100)).toMatchObject({ isValid: false, bonus: { valid: false, reason: "empty" } });
    expect(JournalSummaryCommands.judgePair("5", "4.5", 100)).toMatchObject({ isValid: false, exam: { valid: false, reason: "notWholeNumber" } });
    expect(JournalSummaryCommands.judgePair("5", "101", 100).isValid).toBe(false);
  });

  it("rejects an exam score above the exam maximum rather than clamping it", () => {
    expect(JournalSummaryCommands.judgeInput("101", "exam_score", 100)).toEqual({ valid: false, reason: "aboveMaximum", maximum: 100 });
    expect(JournalSummaryCommands.judgeInput("100", "exam_score", 100)).toEqual({ valid: true, value: 100 });
  });

  it("merges one field into the pair without losing the other", () => {
    expect(JournalSummaryCommands.withField({ bonus_score: 3, exam_score: 40 }, "exam_score", 55)).toEqual({
      bonus_score: 3,
      exam_score: 55,
    });
  });
});

describe("JournalSummaryCommands bonus maximum", () => {
  it("accepts a bonus up to the journal's own maximum and rejects above it", () => {
    expect(JournalSummaryCommands.judgeInput("35", "bonus_score", 70, 35)).toEqual({ valid: true, value: 35 });
    expect(JournalSummaryCommands.judgeInput("36", "bonus_score", 70, 35)).toEqual({ valid: false, reason: "aboveMaximum", maximum: 35 });
    expect(JournalSummaryCommands.judgeInput("21", "bonus_score", 70)).toEqual({ valid: false, reason: "aboveMaximum", maximum: 20 });
  });

  it("applies the bonus maximum to pairs", () => {
    expect(JournalSummaryCommands.judgePair("30", "10", 70, 35).isValid).toBe(true);
    expect(JournalSummaryCommands.judgePair("30", "10", 70, 20).isValid).toBe(false);
  });
});

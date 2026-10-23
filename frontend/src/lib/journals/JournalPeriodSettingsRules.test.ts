import { describe, expect, it } from "vitest";
import { AuthApiError, NetworkError } from "../auth/errors";
import { JournalPeriodSettingsRules } from "./JournalPeriodSettingsRules";
import type { JournalStudentResponse } from "./types";

describe("JournalPeriodSettingsRules.judgeInput", () => {
  it.each(["0", "70", "100", " 55 "])("accepts %j", (raw) => {
    expect(JournalPeriodSettingsRules.judgeInput(raw)).toEqual({ valid: true, value: Number(raw.trim()) });
  });

  it("never clamps: out-of-range stays invalid", () => {
    expect(JournalPeriodSettingsRules.judgeInput("101")).toEqual({ valid: false, reason: "outOfRange" });
    expect(JournalPeriodSettingsRules.judgeInput("100000")).toEqual({ valid: false, reason: "outOfRange" });
  });

  it.each(["", "   "])("treats %j as empty, not zero", (raw) => {
    expect(JournalPeriodSettingsRules.judgeInput(raw)).toEqual({ valid: false, reason: "empty" });
  });

  it.each(["7.5", "-1", "1e2", "abc", "٣"])("rejects %j as not a whole number", (raw) => {
    expect(JournalPeriodSettingsRules.judgeInput(raw)).toEqual({ valid: false, reason: "notWholeNumber" });
  });
});

describe("JournalPeriodSettingsRules.highestExamScore", () => {
  const student = (examScore: number | null): JournalStudentResponse => ({
    student_id: 1,
    first_name: "A",
    last_name: "B",
    email: "a@b.c",
    color_hex: "",
    entries: [],
    summary: examScore === null ? null : ({ exam_score: examScore } as NonNullable<JournalStudentResponse["summary"]>),
  });

  it("returns the maximum over available summaries and null when none exist", () => {
    expect(JournalPeriodSettingsRules.highestExamScore([student(10), student(60), student(null)])).toBe(60);
    expect(JournalPeriodSettingsRules.highestExamScore([student(null)])).toBeNull();
    expect(JournalPeriodSettingsRules.highestExamScore([])).toBeNull();
  });
});

describe("JournalPeriodSettingsRules.classifyFailure", () => {
  it("names the constraint only when a rejected request is below an existing score", () => {
    expect(JournalPeriodSettingsRules.classifyFailure(new AuthApiError(400, "x"), 40, 60)).toEqual({ kind: "belowExistingScore", highestExamScore: 60 });
    expect(JournalPeriodSettingsRules.classifyFailure(new AuthApiError(400, "x"), 60, 60)).toEqual({ kind: "outOfRange" });
    expect(JournalPeriodSettingsRules.classifyFailure(new AuthApiError(400, "x"), 40, null)).toEqual({ kind: "outOfRange" });
  });

  it("maps status codes and transport failures", () => {
    expect(JournalPeriodSettingsRules.classifyFailure(new AuthApiError(403, "x"), 40, 60).kind).toBe("forbidden");
    expect(JournalPeriodSettingsRules.classifyFailure(new AuthApiError(404, "x"), 40, 60).kind).toBe("notFound");
    expect(JournalPeriodSettingsRules.classifyFailure(new AuthApiError(500, "x"), 40, 60).kind).toBe("unexpected");
    expect(JournalPeriodSettingsRules.classifyFailure(new NetworkError(), 40, 60).kind).toBe("offline");
    expect(JournalPeriodSettingsRules.classifyFailure(new Error("x"), 40, 60).kind).toBe("unexpected");
  });
});

describe("JournalPeriodSettingsRules bonus maximum", () => {
  const student = (bonusScore: number | null): JournalStudentResponse => ({
    student_id: 1,
    first_name: "A",
    last_name: "B",
    email: "a@b.c",
    color_hex: "",
    entries: [],
    summary: bonusScore === null ? null : ({ bonus_score: bonusScore } as NonNullable<JournalStudentResponse["summary"]>),
  });

  it("finds the highest stored bonus", () => {
    expect(JournalPeriodSettingsRules.highestBonusScore([student(4), student(18), student(null)])).toBe(18);
    expect(JournalPeriodSettingsRules.highestBonusScore([])).toBeNull();
  });

  it("names the bonus constraint when a rejected request is below an existing bonus", () => {
    expect(
      JournalPeriodSettingsRules.classifyFailure(new AuthApiError(400, "x"), 70, 10, 10, 18),
    ).toEqual({ kind: "belowExistingBonus", highestBonusScore: 18 });
    expect(JournalPeriodSettingsRules.classifyFailure(new AuthApiError(400, "x"), 70, 10, 30, 18)).toEqual({ kind: "outOfRange" });
  });
});

describe("JournalPeriodSettingsRules.judgeInput existing-score floor", () => {
  it("rejects a maximum below the highest existing score before the server does", () => {
    expect(JournalPeriodSettingsRules.judgeInput("1", 2)).toEqual({ valid: false, reason: "belowExisting", floor: 2 });
    expect(JournalPeriodSettingsRules.judgeInput("2", 2)).toEqual({ valid: true, value: 2 });
    expect(JournalPeriodSettingsRules.judgeInput("1", null)).toEqual({ valid: true, value: 1 });
  });

  it("keeps the server upper limit of 100 for both maximums", () => {
    expect(JournalPeriodSettingsRules.judgeInput("100", 0)).toEqual({ valid: true, value: 100 });
    expect(JournalPeriodSettingsRules.judgeInput("101", 0)).toEqual({ valid: false, reason: "outOfRange" });
  });
});

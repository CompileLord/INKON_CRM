import { AuthApiError, NetworkError } from "../auth/errors";
import type { JournalStudentResponse } from "./types";

export type ExamMaximumVerdict =
  | { valid: true; value: number }
  | { valid: false; reason: "empty" | "notWholeNumber" | "outOfRange" };

export type PeriodSettingsFailure =
  | { kind: "belowExistingScore"; highestExamScore: number }
  | { kind: "outOfRange" }
  | { kind: "forbidden" }
  | { kind: "notFound" }
  | { kind: "offline" }
  | { kind: "unexpected" };

export class JournalPeriodSettingsRules {
  static readonly MINIMUM_EXAM_MAXIMUM: number = 0;
  static readonly MAXIMUM_EXAM_MAXIMUM: number = 100;

  static judgeInput(rawInput: string): ExamMaximumVerdict {
    const trimmedInput: string = rawInput.trim();
    if (trimmedInput.length === 0) return { valid: false, reason: "empty" };
    if (!/^\d{1,9}$/.test(trimmedInput)) return { valid: false, reason: "notWholeNumber" };
    const parsedValue: number = Number(trimmedInput);
    if (parsedValue < JournalPeriodSettingsRules.MINIMUM_EXAM_MAXIMUM || parsedValue > JournalPeriodSettingsRules.MAXIMUM_EXAM_MAXIMUM) {
      return { valid: false, reason: "outOfRange" };
    }
    return { valid: true, value: parsedValue };
  }

  static highestExamScore(students: JournalStudentResponse[]): number | null {
    const examScores: number[] = students.flatMap((student) => (student.summary ? [student.summary.exam_score] : []));
    return examScores.length === 0 ? null : Math.max(...examScores);
  }

  static classifyFailure(error: unknown, requestedMaximum: number, highestExamScore: number | null): PeriodSettingsFailure {
    if (error instanceof NetworkError) return { kind: "offline" };
    if (!(error instanceof AuthApiError)) return { kind: "unexpected" };
    if (error.status === 403) return { kind: "forbidden" };
    if (error.status === 404) return { kind: "notFound" };
    if (error.status === 400 || error.status === 422) {
      if (highestExamScore !== null && highestExamScore > requestedMaximum) {
        return { kind: "belowExistingScore", highestExamScore };
      }
      return { kind: "outOfRange" };
    }
    return { kind: "unexpected" };
  }
}

import { JournalScoringRules } from "./JournalScoringRules";

export interface JournalEntryValue {
  attendance: boolean;
  score: number;
  comment: string | null;
}

export interface JournalSummaryValue {
  bonus_score: number;
  exam_score: number;
}

export type JournalEntryCommand =
  | { kind: "score"; score: number }
  | { kind: "attendance"; attended: boolean }
  | { kind: "comment"; comment: string | null | undefined };

export type JournalSummaryField = "bonus_score" | "exam_score";

export type SummaryInputVerdict =
  | { valid: true; value: number }
  | { valid: false; reason: "empty" | "notWholeNumber" | "aboveMaximum"; maximum?: number };

export interface SummaryPairVerdict {
  bonus: SummaryInputVerdict;
  exam: SummaryInputVerdict;
  isValid: boolean;
}

export class JournalEntryCommands {
  static readonly MINIMUM_SCORE: number = 0;
  static readonly MAXIMUM_SCORE: number = 5;

  static normalizeComment(rawComment: string | null | undefined): string | null {
    if (rawComment === null || rawComment === undefined) return null;
    const trimmedComment: string = rawComment.trim();
    return trimmedComment.length > 0 ? trimmedComment : null;
  }

  static isValidScore(score: number): boolean {
    return (
      Number.isInteger(score) &&
      score >= JournalEntryCommands.MINIMUM_SCORE &&
      score <= JournalEntryCommands.MAXIMUM_SCORE
    );
  }

  static apply(current: JournalEntryValue, command: JournalEntryCommand): JournalEntryValue {
    if (command.kind === "score") {
      if (!JournalEntryCommands.isValidScore(command.score)) return current;
      return {
        attendance: command.score > 0 ? true : current.attendance,
        score: command.score,
        comment: current.comment,
      };
    }
    if (command.kind === "attendance") {
      return {
        attendance: command.attended,
        score: command.attended ? current.score : 0,
        comment: current.comment,
      };
    }
    return {
      attendance: current.attendance,
      score: current.score,
      comment: JournalEntryCommands.normalizeComment(command.comment),
    };
  }

  static fromLegacyPatch(
    current: JournalEntryValue,
    patch: { attendance: boolean; score: number; comment?: string | null },
  ): JournalEntryValue {
    return {
      attendance: patch.score > 0 ? true : patch.attendance,
      score: patch.score,
      comment: patch.comment === undefined ? current.comment : JournalEntryCommands.normalizeComment(patch.comment),
    };
  }

  static areEqual(first: JournalEntryValue, second: JournalEntryValue): boolean {
    return (
      first.attendance === second.attendance &&
      first.score === second.score &&
      (first.comment ?? null) === (second.comment ?? null)
    );
  }
}

export class JournalSummaryCommands {
  static readonly MAXIMUM_BONUS_SCORE: number = JournalScoringRules.MAXIMUM_BONUS_SCORE;

  static judgeInput(
    rawInput: string,
    field: JournalSummaryField,
    examMaximum: number,
    bonusMaximum: number = JournalSummaryCommands.MAXIMUM_BONUS_SCORE,
  ): SummaryInputVerdict {
    const trimmedInput: string = rawInput.trim();
    if (trimmedInput.length === 0) return { valid: false, reason: "empty" };
    if (!/^\d{1,9}$/.test(trimmedInput)) return { valid: false, reason: "notWholeNumber" };
    const parsedValue: number = Number(trimmedInput);
    const maximum: number = field === "exam_score" ? examMaximum : bonusMaximum;
    if (parsedValue > maximum) return { valid: false, reason: "aboveMaximum", maximum };
    return { valid: true, value: parsedValue };
  }

  static judgePair(
    bonusText: string,
    examText: string,
    examMaximum: number,
    bonusMaximum: number = JournalSummaryCommands.MAXIMUM_BONUS_SCORE,
  ): SummaryPairVerdict {
    const bonus: SummaryInputVerdict = JournalSummaryCommands.judgeInput(bonusText, "bonus_score", examMaximum, bonusMaximum);
    const exam: SummaryInputVerdict = JournalSummaryCommands.judgeInput(examText, "exam_score", examMaximum);
    return { bonus, exam, isValid: bonus.valid && exam.valid };
  }

  static withField(current: JournalSummaryValue, field: JournalSummaryField, value: number): JournalSummaryValue {
    return { ...current, [field]: value };
  }

  static areEqual(first: JournalSummaryValue, second: JournalSummaryValue): boolean {
    return first.bonus_score === second.bonus_score && first.exam_score === second.exam_score;
  }
}

import { AuthApiError, NetworkError } from "../auth/errors";
import { batchUpdateJournalEntries, getJournal, updateJournalStudentSummary } from "./endpoints";
import { type JournalEntryValue, type JournalSummaryValue } from "./journalCommands";
import { type JournalQueueApi } from "./journalQueueTypes";
import {
  type JournalCellRejection,
  type JournalEmbeddedSummary,
  type JournalEntryResponse,
  type JournalEntryStateResponse,
  type JournalStudentSummaryResponse,
} from "./types";

export const MAX_ENTRIES_PER_REQUEST: number = 250;
export const DEBOUNCE_MS: number = 700;
export const MAX_LATENCY_MS: number = 3000;
export const BACKOFF_DELAYS_MS: readonly number[] = [1000, 3000, 8000];
export const ENTRY_SAVED_MARKER_MS: number = 1500;
export const SAVED_PHASE_MS: number = 2000;
export const DERIVED_REFRESH_MS: number = 2000;

export const DEFAULT_JOURNAL_QUEUE_API: JournalQueueApi = {
  batchUpdate: (journalId, payload) => batchUpdateJournalEntries(journalId, payload),
  updateSummary: (journalId, studentId, payload) => updateJournalStudentSummary(journalId, studentId, payload),
  fetchJournal: (journalId) => getJournal(journalId),
};

export interface EntryRecord {
  key: string;
  studentId: number;
  lessonDate: string;
  confirmed: JournalEntryValue | undefined;
  confirmedGraded: boolean;
  version: number;
  draft: JournalEntryValue | null;
  inFlight: { value: JournalEntryValue; version: number } | null;
  failed: boolean;
}

export interface SummaryRecord {
  studentId: number;
  confirmed: JournalSummaryValue | undefined;
  version: number;
  draft: JournalSummaryValue | null;
  inFlight: { value: JournalSummaryValue; version: number } | null;
  failed: boolean;
}

export interface ConflictRecord {
  type: "entry" | "summary";
  studentId: number;
  lessonDate: string;
  submittedVersion: number;
  current: JournalEntryStateResponse | JournalStudentSummaryResponse | null | undefined;
}

export type CycleOutcome = "ok" | "conflict" | "terminal" | "transient";

export interface CycleTally {
  conflict: boolean;
  blockedByNewerDraft: boolean;
  terminal: boolean;
  transient: boolean;
  affectedEntryKeys: Set<string>;
  affectedSummaryIds: Set<number>;
  summaryConflictCreated: boolean;
}

export class JournalRequestErrors {
  static isConflict(error: unknown): boolean {
    return JournalRequestErrors.statusOf(error) === 409;
  }

  static isTransient(error: unknown): boolean {
    if (error instanceof NetworkError) return true;
    const status: number | undefined = JournalRequestErrors.statusOf(error);
    return status !== undefined && (status >= 500 || status === 0);
  }

  static isForbidden(error: unknown): boolean {
    return JournalRequestErrors.statusOf(error) === 403;
  }

  static cellRejections(error: unknown): JournalCellRejection[] | null {
    if (JournalRequestErrors.statusOf(error) !== 422) return null;
    const detail: unknown = typeof error === "object" && error !== null && "detail" in error ? (error as { detail: unknown }).detail : null;
    if (typeof detail !== "object" || detail === null || !("cells" in detail)) return null;
    const cells: unknown = (detail as { cells: unknown }).cells;
    return Array.isArray(cells) && cells.length > 0 ? (cells as JournalCellRejection[]) : null;
  }

  private static statusOf(error: unknown): number | undefined {
    if (error instanceof AuthApiError) return error.status;
    if (typeof error === "object" && error !== null && "status" in error) {
      const status: unknown = (error as { status: unknown }).status;
      return typeof status === "number" ? status : undefined;
    }
    return undefined;
  }
}

export function entryValueOf(entry: JournalEntryResponse | JournalEntryStateResponse): JournalEntryValue {
  return { attendance: entry.attendance, score: entry.score, comment: entry.comment ?? null };
}

export function isGradedState(entry: JournalEntryResponse | JournalEntryStateResponse): boolean {
  return entry.is_graded !== false;
}

export function summaryValueOf(summary: JournalEmbeddedSummary | JournalStudentSummaryResponse): JournalSummaryValue {
  return { bonus_score: summary.bonus_score, exam_score: summary.exam_score };
}

export function emptyTally(): CycleTally {
  return {
    conflict: false,
    blockedByNewerDraft: false,
    terminal: false,
    transient: false,
    affectedEntryKeys: new Set<string>(),
    affectedSummaryIds: new Set<number>(),
    summaryConflictCreated: false,
  };
}

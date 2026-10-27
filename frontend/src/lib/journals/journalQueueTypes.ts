import type { JournalEntryValue, JournalSummaryValue } from "./journalCommands";
import type {
  JournalBatchUpdateResponse,
  JournalCellRejectionCode,
  JournalDetailResponse,
  JournalEntryStateResponse,
  JournalEntryUpdate,
  JournalStudentSummaryResponse,
  JournalStudentSummaryUpdate,
} from "./types";

export type CellSaveStatus = "dirty" | "saving" | "saved" | "error" | "conflict";
export type AggregateSaveStatus = "idle" | "pending" | "saving" | "saved" | "error";
export type JournalSavePhase = "idle" | "saved" | "unsaved" | "saving" | "failed" | "conflict";

export interface JournalAutosaveEntryConflict {
  type: "entry";
  student_id: number;
  lesson_date: string;
  submitted_version: number;
  current?: JournalEntryStateResponse | null;
  mine: JournalEntryValue | null;
}

export interface JournalAutosaveSummaryConflict {
  type: "summary";
  student_id: number;
  submitted_version: number;
  current?: JournalStudentSummaryResponse | null;
  mine: JournalSummaryValue | null;
}

export type JournalAutosaveConflict = JournalAutosaveEntryConflict | JournalAutosaveSummaryConflict;

export interface JournalSaveCounts {
  conflicts: number;
  failed: number;
  saving: number;
  unsaved: number;
}

export interface JournalQueueSnapshot {
  journalId: number | undefined;
  revision: number;
  cellStatus: Map<string, CellSaveStatus>;
  summaryStatus: Map<number, CellSaveStatus>;
  cellRejections: Map<string, JournalCellRejectionCode>;
  conflicts: JournalAutosaveConflict[];
  phase: JournalSavePhase;
  aggregateStatus: AggregateSaveStatus;
  counts: JournalSaveCounts;
  hasPending: boolean;
  draining: boolean;
  refetching: boolean;
  forbidden: boolean;
}

export type JournalDrainResult =
  | { kind: "acknowledged" }
  | { kind: "failed"; unsettledCount: number }
  | { kind: "conflict"; conflictCount: number }
  | { kind: "unavailable" };

export type JournalDiscardResult = { kind: "discarded" } | { kind: "unavailable" };

export interface JournalQueueApi {
  batchUpdate(journalId: number, payload: JournalEntryUpdate[]): Promise<JournalBatchUpdateResponse>;
  updateSummary(
    journalId: number,
    studentId: number,
    payload: JournalStudentSummaryUpdate,
  ): Promise<JournalStudentSummaryResponse>;
  fetchJournal(journalId: number): Promise<JournalDetailResponse>;
}

export const EMPTY_JOURNAL_COUNTS: JournalSaveCounts = { conflicts: 0, failed: 0, saving: 0, unsaved: 0 };

export function summaryConflictKey(studentId: number): string {
  return `${studentId}:summary`;
}

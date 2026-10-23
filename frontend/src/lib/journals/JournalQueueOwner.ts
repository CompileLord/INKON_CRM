import {
  JournalEntryCommands,
  JournalSummaryCommands,
  type JournalEntryCommand,
  type JournalEntryValue,
  type JournalSummaryField,
  type JournalSummaryValue,
} from "./journalCommands";
import {
  summaryConflictKey,
  type JournalAutosaveConflict,
  type JournalDiscardResult,
  type JournalDrainResult,
} from "./journalQueueTypes";
import { entryKey, type JournalDetailResponse } from "./types";
import {
  BACKOFF_DELAYS_MS,
  DEBOUNCE_MS,
  DEFAULT_JOURNAL_QUEUE_API,
  MAX_ENTRIES_PER_REQUEST,
  MAX_LATENCY_MS,
  type ConflictRecord,
  type EntryRecord,
  type SummaryRecord,
} from "./journalQueueRecords";
import { JournalQueueReconciler } from "./JournalQueueReconciler";

export { MAX_ENTRIES_PER_REQUEST, DEBOUNCE_MS, MAX_LATENCY_MS, BACKOFF_DELAYS_MS, DEFAULT_JOURNAL_QUEUE_API };

export class JournalQueueOwner extends JournalQueueReconciler {
  applyEntryCommand(studentId: number, lessonDate: string, command: JournalEntryCommand): void {
    const record: EntryRecord = this.entryRecord(studentId, lessonDate);
    const current: JournalEntryValue = this.effectiveEntry(record);
    const next: JournalEntryValue = JournalEntryCommands.apply(current, command);
    this.stageEntry(record, next, record.version, command.kind !== "comment");
  }

  editEntry = (
    _key: string,
    patch: { student_id: number; lesson_date: string; attendance: boolean; score: number; comment?: string | null; version: number },
  ): void => {
    const record: EntryRecord = this.entryRecord(patch.student_id, patch.lesson_date);
    const next: JournalEntryValue = JournalEntryCommands.fromLegacyPatch(this.effectiveEntry(record), patch);
    const cachedVersion: number = this.cache.readEntry(patch.student_id, patch.lesson_date)?.version ?? 0;
    this.stageEntry(record, next, Math.max(patch.version, cachedVersion));
  };

  editSummaryField(studentId: number, field: JournalSummaryField, value: number): void {
    const record: SummaryRecord | null = this.summaryRecord(studentId);
    if (!record) return;
    const next: JournalSummaryValue = JournalSummaryCommands.withField(this.effectiveSummary(record), field, value);
    this.stageSummary(record, next, record.version);
  }

  editSummary = (studentId: number, patch: { bonus_score: number; exam_score: number; version: number }): void => {
    const record: SummaryRecord = this.summaryRecordOrCreate(studentId, patch.version);
    this.stageSummary(record, { bonus_score: patch.bonus_score, exam_score: patch.exam_score }, patch.version);
  };

  resolveConflict = (conflict: JournalAutosaveConflict, choice: "keepMine" | "keepTheirs"): void => {
    const key: string = conflict.type === "summary" ? summaryConflictKey(conflict.student_id) : entryKey(conflict.student_id, conflict.lesson_date);
    const stored: ConflictRecord | undefined = this.conflicts.get(key);
    if (!stored || stored.current === undefined || this.refetching) return;
    if (choice === "keepMine" && stored.current === null) return;

    if (stored.type === "summary") {
      this.resolveSummaryConflict(stored, choice);
    } else {
      this.resolveEntryConflict(stored, choice);
    }
  };

  retryManual = async (): Promise<void> => {
    this.halted = false;
    this.forbidden = false;
    this.retryCount = 0;
    this.clearRetryTimer();
    if (this.activeFlush) await this.activeFlush;
    const fresh: JournalDetailResponse | null = await this.refetchAuthoritative();
    if (!fresh) return;
    this.reconcileWithServer(fresh);
    if (this.conflicts.size === 0 && this.hasSendableWork()) await this.flush();
  };

  async drain(): Promise<JournalDrainResult> {
    if (this.disposed) return { kind: "unavailable" };
    this.draining = true;
    this.clearEditTimers();
    this.clearRetryTimer();
    this.halted = false;
    this.retryCount = 0;
    this.publish();
    try {
      for (;;) {
        if (this.activeFlush) {
          await this.activeFlush;
          if (this.lastOutcome !== "ok") break;
        }
        if (!this.hasSendableWork()) break;
        await this.flush();
        if (this.lastOutcome !== "ok") break;
      }
    } finally {
      this.draining = false;
      this.publish();
    }
    if (this.conflicts.size > 0) return { kind: "conflict", conflictCount: this.conflicts.size };
    const unsettledCount: number = this.countUnsettledRecords();
    if (unsettledCount > 0) return { kind: "failed", unsettledCount };
    return { kind: "acknowledged" };
  }

  async discardUnsettled(): Promise<JournalDiscardResult> {
    if (this.disposed) return { kind: "unavailable" };
    this.clearEditTimers();
    this.clearRetryTimer();
    if (this.activeFlush) await this.activeFlush;
    let fresh: JournalDetailResponse | null = null;
    if (this.uncertain) {
      fresh = await this.refetchAuthoritative();
      if (!fresh) return { kind: "unavailable" };
    }
    this.revertLocalWork(fresh);
    this.halted = false;
    this.uncertain = false;
    this.retryCount = 0;
    this.recentlySaved = false;
    this.publish();
    return { kind: "discarded" };
  }
}

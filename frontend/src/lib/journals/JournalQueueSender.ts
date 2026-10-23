import {
  JournalEntryCommands,
  JournalSummaryCommands,
  type JournalEntryValue,
  type JournalSummaryValue,
} from "./journalCommands";
import { summaryConflictKey } from "./journalQueueTypes";
import {
  entryKey,
  type JournalBatchUpdateResponse,
  type JournalDetailResponse,
  type JournalEntryConflictResponse,
  type JournalEntryStateResponse,
  type JournalEntryUpdate,
  type JournalStudentSummaryResponse,
} from "./types";
import {
  BACKOFF_DELAYS_MS,
  DERIVED_REFRESH_MS,
  ENTRY_SAVED_MARKER_MS,
  MAX_ENTRIES_PER_REQUEST,
  SAVED_PHASE_MS,
  JournalRequestErrors,
  emptyTally,
  entryValueOf,
  isGradedState,
  summaryValueOf,
  type CycleOutcome,
  type CycleTally,
  type EntryRecord,
  type SummaryRecord,
} from "./journalQueueRecords";
import { JournalQueueBase } from "./JournalQueueBase";

export abstract class JournalQueueSender extends JournalQueueBase {
  protected abstract reconcileWithServer(fresh: JournalDetailResponse): void;

  flush = (): Promise<void> => {
    this.clearEditTimers();
    this.clearRetryTimer();
    this.halted = false;
    if (this.activeFlush) return this.activeFlush;
    if (!this.hasSendableWork()) {
      this.publish();
      return Promise.resolve();
    }
    this.activeFlush = this.runCycles().finally(() => {
      this.activeFlush = null;
      this.publish();
    });
    return this.activeFlush;
  };

  protected async runCycles(): Promise<void> {
    this.acknowledgedInRun = false;
    for (;;) {
      const claimedEntryKeys: string[] = [];
      const claimedSummaryIds: number[] = [];
      this.entries.forEach((record, key) => {
        if (claimedEntryKeys.length >= MAX_ENTRIES_PER_REQUEST) return;
        if (record.draft && !this.conflicts.has(key) && !this.rejectedCells.has(key)) {
          record.inFlight = { value: record.draft, version: record.version };
          record.draft = null;
          record.failed = false;
          claimedEntryKeys.push(key);
        }
      });
      this.summaries.forEach((record, studentId) => {
        if (record.draft && !this.conflicts.has(summaryConflictKey(studentId))) {
          record.inFlight = { value: record.draft, version: record.version };
          record.draft = null;
          record.failed = false;
          claimedSummaryIds.push(studentId);
        }
      });

      if (claimedEntryKeys.length === 0 && claimedSummaryIds.length === 0) {
        this.lastOutcome = "ok";
        this.settleQuietly();
        return;
      }

      this.recentlySaved = false;
      this.publish();
      const outcome: CycleOutcome = await this.sendClaimed(claimedEntryKeys, claimedSummaryIds);
      this.lastOutcome = outcome;
      this.publish();
      if (outcome !== "ok") {
        if (outcome === "conflict") this.refreshUnknownConflicts();
        return;
      }
    }
  }

  protected async sendClaimed(entryKeys: string[], summaryIds: number[]): Promise<CycleOutcome> {
    const tally: CycleTally = emptyTally();
    if (entryKeys.length > 0) await this.sendEntries(entryKeys, tally);
    for (const studentId of summaryIds) {
      await this.sendSummary(studentId, tally);
    }
    return this.settleCycle(tally);
  }

  protected async sendEntries(entryKeys: string[], tally: CycleTally): Promise<void> {
    const payload: JournalEntryUpdate[] = [];
    entryKeys.forEach((key) => {
      const record: EntryRecord | undefined = this.entries.get(key);
      if (!record?.inFlight) return;
      payload.push({
        student_id: record.studentId,
        lesson_date: record.lessonDate,
        attendance: record.inFlight.value.attendance,
        score: record.inFlight.value.score,
        comment: record.inFlight.value.comment,
        version: record.inFlight.version,
      });
    });

    try {
      const response: JournalBatchUpdateResponse | undefined = await this.api.batchUpdate(this.journalId, payload);
      this.absorbBatchResponse(response, tally);
    } catch (error: unknown) {
      this.absorbEntryFailure(error, tally);
    }
  }

  protected absorbBatchResponse(response: JournalBatchUpdateResponse | undefined, tally: CycleTally): void {
    const applied: JournalEntryStateResponse[] = response?.applied ?? [];
    const rejected: JournalEntryConflictResponse[] = response?.conflicts ?? [];
    const summaries: JournalStudentSummaryResponse[] = response?.summaries ?? [];

    applied.forEach((item) => this.absorbAppliedEntry(item));
    rejected.forEach((item) => this.absorbRejectedEntry(item, tally));
    summaries.forEach((item) => this.absorbDerivedSummary(item));

    this.entries.forEach((record, key) => {
      if (!record.inFlight) return;
      this.restoreInFlightEntry(record);
      record.failed = true;
      tally.terminal = true;
      tally.affectedEntryKeys.add(key);
      this.uncertain = true;
    });
  }

  protected absorbAppliedEntry(item: JournalEntryStateResponse): void {
    const record: EntryRecord = this.entryRecord(item.student_id, item.lesson_date);
    const appliedValue: JournalEntryValue = entryValueOf(item);
    record.version = Math.max(record.version, item.version);
    record.confirmed = appliedValue;
    record.confirmedGraded = true;
    record.inFlight = null;
    record.failed = false;
    this.acknowledgedInRun = true;
    if (record.draft && JournalEntryCommands.areEqual(record.draft, appliedValue)) record.draft = null;
    if (record.draft) {
      this.cache.writeEntry(record.studentId, record.lessonDate, record.draft, record.version);
    } else {
      this.cache.writeEntry(record.studentId, record.lessonDate, appliedValue, record.version);
      this.markEntrySaved(record.key);
    }
    this.scheduleDerivedRefresh();
  }

  protected absorbRejectedEntry(item: JournalEntryConflictResponse, tally: CycleTally): void {
    const record: EntryRecord = this.entryRecord(item.student_id, item.lesson_date);
    const submitted: JournalEntryValue | undefined = record.inFlight?.value;
    const hadNewerDraft: boolean = record.draft !== null;
    record.inFlight = null;
    if (!hadNewerDraft && submitted) record.draft = submitted;

    const current: JournalEntryStateResponse | null | undefined = item.current;
    const isAlreadyServerState: boolean =
      current !== null &&
      current !== undefined &&
      submitted !== undefined &&
      JournalEntryCommands.areEqual(entryValueOf(current), submitted);

    if (isAlreadyServerState && current) {
      record.version = Math.max(record.version, current.version);
      record.confirmed = entryValueOf(current);
      record.confirmedGraded = isGradedState(current);
      this.acknowledgedInRun = true;
      if (hadNewerDraft) {
        this.cache.writeEntry(record.studentId, record.lessonDate, record.draft as JournalEntryValue, record.version);
      } else {
        record.draft = null;
        this.cache.writeEntry(record.studentId, record.lessonDate, record.confirmed, record.version);
        this.markEntrySaved(record.key);
      }
      return;
    }

    this.conflicts.set(record.key, {
      type: "entry",
      studentId: item.student_id,
      lessonDate: item.lesson_date,
      submittedVersion: item.submitted_version,
      current,
    });
    tally.conflict = true;
  }

  protected absorbDerivedSummary(item: JournalStudentSummaryResponse): void {
    const record: SummaryRecord = this.summaryRecordOrCreate(item.student_id, item.version);
    record.version = Math.max(record.version, item.version);
    if (!record.draft && !record.inFlight) record.confirmed = summaryValueOf(item);
    this.cache.writeServerSummary(item, record.draft ?? record.inFlight?.value ?? null, record.version);
  }

  protected absorbEntryFailure(error: unknown, tally: CycleTally): void {
    const isConflict: boolean = JournalRequestErrors.isConflict(error);
    const isTransient: boolean = JournalRequestErrors.isTransient(error);
    this.entries.forEach((record, key) => {
      if (!record.inFlight) return;
      const hadNewerDraft: boolean = this.restoreInFlightEntry(record);
      if (isConflict) {
        if (hadNewerDraft) {
          tally.blockedByNewerDraft = true;
        } else {
          this.conflicts.set(key, {
            type: "entry",
            studentId: record.studentId,
            lessonDate: record.lessonDate,
            submittedVersion: record.version,
            current: undefined,
          });
          tally.conflict = true;
        }
      } else {
        tally.affectedEntryKeys.add(key);
      }
    });
    if (isConflict) return;
    if (isTransient) {
      this.uncertain = true;
      tally.transient = true;
      return;
    }
    JournalRequestErrors.cellRejections(error)?.forEach((cell) => {
      this.rejectedCells.set(entryKey(cell.student_id, cell.lesson_date), cell.code);
    });
    tally.terminal = true;
    if (JournalRequestErrors.isForbidden(error)) this.forbidden = true;
    tally.affectedEntryKeys.forEach((key) => {
      const record: EntryRecord | undefined = this.entries.get(key);
      if (record?.draft) record.failed = true;
    });
  }

  protected restoreInFlightEntry(record: EntryRecord): boolean {
    const hadNewerDraft: boolean = record.draft !== null;
    if (!hadNewerDraft && record.inFlight) record.draft = record.inFlight.value;
    record.inFlight = null;
    return hadNewerDraft;
  }

  protected async sendSummary(studentId: number, tally: CycleTally): Promise<void> {
    const record: SummaryRecord | undefined = this.summaries.get(studentId);
    if (!record?.inFlight) return;
    const snapshot: { value: JournalSummaryValue; version: number } = record.inFlight;
    try {
      const result: JournalStudentSummaryResponse = await this.api.updateSummary(this.journalId, studentId, {
        bonus_score: snapshot.value.bonus_score,
        exam_score: snapshot.value.exam_score,
        version: snapshot.version,
      });
      record.inFlight = null;
      record.version = Math.max(record.version, result.version);
      record.confirmed = summaryValueOf(result);
      record.failed = false;
      this.acknowledgedInRun = true;
      if (record.draft && JournalSummaryCommands.areEqual(record.draft, record.confirmed)) record.draft = null;
      this.cache.writeServerSummary(result, record.draft, record.version);
      if (!record.draft) this.markSummarySaved(studentId);
      this.scheduleDerivedRefresh();
    } catch (error: unknown) {
      const hadNewerDraft: boolean = record.draft !== null;
      if (!hadNewerDraft) record.draft = snapshot.value;
      record.inFlight = null;
      if (JournalRequestErrors.isConflict(error)) {
        this.conflicts.set(summaryConflictKey(studentId), {
          type: "summary",
          studentId,
          lessonDate: "",
          submittedVersion: snapshot.version,
          current: undefined,
        });
        tally.conflict = true;
        tally.summaryConflictCreated = true;
      } else {
        tally.affectedSummaryIds.add(studentId);
        if (JournalRequestErrors.isTransient(error)) {
          this.uncertain = true;
          tally.transient = true;
        } else {
          tally.terminal = true;
          if (JournalRequestErrors.isForbidden(error)) this.forbidden = true;
          if (record.draft) record.failed = true;
        }
      }
    }
  }

  protected settleCycle(tally: CycleTally): CycleOutcome {
    if (tally.conflict || tally.blockedByNewerDraft || tally.terminal) {
      this.clearEditTimers();
      this.retryCount = 0;
    }
    if (tally.terminal) this.markAffectedFailed(tally);
    if (tally.blockedByNewerDraft) this.halted = true;

    if (tally.transient) {
      if (this.retryCount < BACKOFF_DELAYS_MS.length && !this.draining) {
        const delay: number = BACKOFF_DELAYS_MS[this.retryCount];
        this.retryCount += 1;
        this.retryTimer = setTimeout(() => {
          this.retryTimer = null;
          void this.flush();
        }, delay);
      } else {
        this.markAffectedFailed(tally);
        this.retryCount = 0;
        return "terminal";
      }
    }

    if (tally.conflict) return "conflict";
    if (tally.terminal || tally.blockedByNewerDraft) return "terminal";
    if (tally.transient) return "transient";
    this.retryCount = 0;
    return "ok";
  }

  protected markAffectedFailed(tally: CycleTally): void {
    tally.affectedEntryKeys.forEach((key) => {
      const record: EntryRecord | undefined = this.entries.get(key);
      if (record?.draft) record.failed = true;
    });
    tally.affectedSummaryIds.forEach((studentId) => {
      const record: SummaryRecord | undefined = this.summaries.get(studentId);
      if (record?.draft) record.failed = true;
    });
  }

  protected settleQuietly(): void {
    if (this.acknowledgedInRun && !this.hasUnsettledWork() && this.conflicts.size === 0) {
      this.uncertain = false;
      this.recentlySaved = true;
      if (this.savedPhaseTimer) clearTimeout(this.savedPhaseTimer);
      this.savedPhaseTimer = setTimeout(() => {
        this.savedPhaseTimer = null;
        this.recentlySaved = false;
        this.publish();
      }, SAVED_PHASE_MS);
    }
    this.acknowledgedInRun = false;
  }

  protected markEntrySaved(key: string): void {
    this.savedEntryKeys.add(key);
    const timer: ReturnType<typeof setTimeout> = setTimeout(() => {
      this.savedMarkerTimers.delete(timer);
      this.savedEntryKeys.delete(key);
      this.publish();
    }, ENTRY_SAVED_MARKER_MS);
    this.savedMarkerTimers.add(timer);
  }

  protected markSummarySaved(studentId: number): void {
    this.savedSummaryIds.add(studentId);
    const timer: ReturnType<typeof setTimeout> = setTimeout(() => {
      this.savedMarkerTimers.delete(timer);
      this.savedSummaryIds.delete(studentId);
      this.publish();
    }, ENTRY_SAVED_MARKER_MS);
    this.savedMarkerTimers.add(timer);
  }

  protected scheduleDerivedRefresh(): void {
    if (this.courseId === undefined) return;
    const courseId: number = this.courseId;
    if (this.derivedRefreshTimer) clearTimeout(this.derivedRefreshTimer);
    this.derivedRefreshTimer = setTimeout(() => {
      this.derivedRefreshTimer = null;
      void this.queryClient.invalidateQueries({ queryKey: ["courses", "progress-chart", courseId] });
      void this.queryClient.invalidateQueries({ queryKey: ["courses", "journal-metrics", courseId] });
      void this.queryClient.invalidateQueries({ queryKey: ["courses", "staff-progress", courseId] });
      void this.queryClient.invalidateQueries({ queryKey: ["courses", "journals", courseId] });
    }, DERIVED_REFRESH_MS);
  }

  protected async refetchAuthoritative(): Promise<JournalDetailResponse | null> {
    this.refetching = true;
    this.publish();
    try {
      const fresh: JournalDetailResponse | undefined = await this.api.fetchJournal(this.journalId);
      if (!fresh || !Array.isArray(fresh.students)) throw new Error("Journal refetch returned no data");
      this.refetchFailed = false;
      return fresh;
    } catch {
      this.refetchFailed = true;
      return null;
    } finally {
      this.refetching = false;
      this.publish();
    }
  }

  protected refreshUnknownConflicts(): void {
    const hasUnknownConflict: boolean = Array.from(this.conflicts.values()).some(
      (conflict) => conflict.current === undefined,
    );
    if (!hasUnknownConflict) return;
    void this.refetchAuthoritative().then((fresh) => {
      if (fresh && !this.disposed) this.reconcileWithServer(fresh);
    });
  }
}

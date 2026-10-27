import type { QueryClient } from "@tanstack/react-query";
import {
  JournalEntryCommands,
  JournalSummaryCommands,
  type JournalEntryValue,
  type JournalSummaryValue,
} from "./journalCommands";
import { JournalDetailCache } from "./journalDetailCache";
import {
  EMPTY_JOURNAL_COUNTS,
  summaryConflictKey,
  type AggregateSaveStatus,
  type CellSaveStatus,
  type JournalAutosaveConflict,
  type JournalQueueApi,
  type JournalQueueSnapshot,
  type JournalSavePhase,
  type JournalSaveCounts,
} from "./journalQueueTypes";
import {
  entryKey,
  type JournalCellRejectionCode,
  type JournalEmbeddedSummary,
  type JournalEntryResponse,
  type JournalEntryStateResponse,
  type JournalStudentSummaryResponse,
} from "./types";
import {
  DEBOUNCE_MS,
  DEFAULT_JOURNAL_QUEUE_API,
  MAX_LATENCY_MS,
  entryValueOf,
  isGradedState,
  summaryValueOf,
  type ConflictRecord,
  type CycleOutcome,
  type EntryRecord,
  type SummaryRecord,
} from "./journalQueueRecords";

export abstract class JournalQueueBase {
  abstract flush: () => Promise<void>;
  protected abstract reapplyLocalWork(): void;

  readonly journalId: number;
  readonly courseId: number | undefined;

  protected readonly queryClient: QueryClient;
  protected readonly api: JournalQueueApi;
  protected readonly cache: JournalDetailCache;

  protected readonly entries: Map<string, EntryRecord> = new Map();
  protected readonly summaries: Map<number, SummaryRecord> = new Map();
  protected readonly conflicts: Map<string, ConflictRecord> = new Map();
  protected readonly rejectedCells: Map<string, JournalCellRejectionCode> = new Map();
  protected readonly savedEntryKeys: Set<string> = new Set();
  protected readonly savedSummaryIds: Set<number> = new Set();
  protected readonly listeners: Set<() => void> = new Set();

  protected activeFlush: Promise<void> | null = null;
  protected lastOutcome: CycleOutcome = "ok";
  protected acknowledgedInRun: boolean = false;
  protected halted: boolean = false;
  protected forbidden: boolean = false;
  protected uncertain: boolean = false;
  protected recentlySaved: boolean = false;
  protected draining: boolean = false;
  protected refetching: boolean = false;
  protected refetchFailed: boolean = false;
  protected disposed: boolean = false;
  protected retryCount: number = 0;
  protected revision: number = 0;
  protected snapshot: JournalQueueSnapshot | null = null;

  protected debounceTimer: ReturnType<typeof setTimeout> | null = null;
  protected maxLatencyTimer: ReturnType<typeof setTimeout> | null = null;
  protected retryTimer: ReturnType<typeof setTimeout> | null = null;
  protected savedPhaseTimer: ReturnType<typeof setTimeout> | null = null;
  protected derivedRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  protected readonly savedMarkerTimers: Set<ReturnType<typeof setTimeout>> = new Set();
  protected readonly stopWatchingCache: () => void;

  constructor(
    journalId: number,
    courseId: number | undefined,
    queryClient: QueryClient,
    api: JournalQueueApi = DEFAULT_JOURNAL_QUEUE_API,
  ) {
    this.journalId = journalId;
    this.courseId = courseId;
    this.queryClient = queryClient;
    this.api = api;
    this.cache = new JournalDetailCache(queryClient, journalId);
    this.stopWatchingCache = queryClient.getQueryCache().subscribe((event) => {
      if (event.type === "updated" && event.action.type === "success" && this.cache.matches(event.query.queryKey)) {
        this.reapplyLocalWork();
      }
    });
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): JournalQueueSnapshot => {
    if (!this.snapshot) this.snapshot = this.buildSnapshot();
    return this.snapshot;
  };

  hasPending(): boolean {
    return this.hasUnsettledWork() || this.conflicts.size > 0;
  }

  flushBestEffort(): void {
    void this.flush();
  }

  dispose(): void {
    this.disposed = true;
    this.clearEditTimers();
    this.clearRetryTimer();
    this.stopWatchingCache();
    [this.savedPhaseTimer, this.derivedRefreshTimer].forEach((timer) => {
      if (timer) clearTimeout(timer);
    });
    this.savedMarkerTimers.forEach((timer) => clearTimeout(timer));
    this.savedMarkerTimers.clear();
    this.listeners.clear();
  }

  protected entryRecord(studentId: number, lessonDate: string): EntryRecord {
    const key: string = entryKey(studentId, lessonDate);
    const existing: EntryRecord | undefined = this.entries.get(key);
    if (existing) return existing;
    const cached: JournalEntryResponse | undefined = this.cache.readEntry(studentId, lessonDate);
    const created: EntryRecord = {
      key,
      studentId,
      lessonDate,
      confirmed: cached ? entryValueOf(cached) : undefined,
      confirmedGraded: cached ? isGradedState(cached) : false,
      version: cached?.version ?? 0,
      draft: null,
      inFlight: null,
      failed: false,
    };
    this.entries.set(key, created);
    return created;
  }

  protected summaryRecord(studentId: number): SummaryRecord | null {
    const existing: SummaryRecord | undefined = this.summaries.get(studentId);
    if (existing) return existing;
    const cached: JournalEmbeddedSummary | null | undefined = this.cache.readSummary(studentId);
    if (!cached) return null;
    return this.summaryRecordOrCreate(studentId, cached.version);
  }

  protected summaryRecordOrCreate(studentId: number, fallbackVersion: number): SummaryRecord {
    const existing: SummaryRecord | undefined = this.summaries.get(studentId);
    if (existing) return existing;
    const cached: JournalEmbeddedSummary | null | undefined = this.cache.readSummary(studentId);
    const created: SummaryRecord = {
      studentId,
      confirmed: cached ? summaryValueOf(cached) : undefined,
      version: cached?.version ?? fallbackVersion,
      draft: null,
      inFlight: null,
      failed: false,
    };
    this.summaries.set(studentId, created);
    return created;
  }

  protected effectiveEntry(record: EntryRecord): JournalEntryValue {
    return record.draft ?? record.inFlight?.value ?? record.confirmed ?? { attendance: false, score: 0, comment: null };
  }

  protected effectiveSummary(record: SummaryRecord): JournalSummaryValue {
    return record.draft ?? record.inFlight?.value ?? record.confirmed ?? { bonus_score: 0, exam_score: 0 };
  }

  protected stageEntry(record: EntryRecord, next: JournalEntryValue, minimumVersion: number, isGrading: boolean = false): void {
    record.version = Math.max(record.version, minimumVersion);
    const matchesConfirmed: boolean =
      record.confirmed !== undefined && (record.confirmedGraded || !isGrading) && JournalEntryCommands.areEqual(next, record.confirmed);
    if (matchesConfirmed && !record.inFlight && !record.draft && !this.conflicts.has(record.key)) return;
    record.draft = matchesConfirmed && !record.inFlight && !this.conflicts.has(record.key) ? null : next;
    record.failed = false;
    this.rejectedCells.delete(record.key);
    this.savedEntryKeys.delete(record.key);
    const isGraded: boolean = record.draft !== null || record.inFlight !== null || record.confirmedGraded;
    this.cache.writeEntry(record.studentId, record.lessonDate, next, record.version, isGraded);
    this.afterStaging(this.conflicts.has(record.key));
  }

  protected stageSummary(record: SummaryRecord, next: JournalSummaryValue, minimumVersion: number): void {
    record.version = Math.max(record.version, minimumVersion);
    const isConflicted: boolean = this.conflicts.has(summaryConflictKey(record.studentId));
    const matchesConfirmed: boolean =
      record.confirmed !== undefined && JournalSummaryCommands.areEqual(next, record.confirmed);
    if (matchesConfirmed && !record.inFlight && !record.draft && !isConflicted) return;
    record.draft = matchesConfirmed && !record.inFlight && !isConflicted ? null : next;
    record.failed = false;
    this.savedSummaryIds.delete(record.studentId);
    this.cache.writeSummaryDraft(record.studentId, next, record.version);
    this.afterStaging(isConflicted);
  }

  protected afterStaging(isConflicted: boolean): void {
    if (isConflicted) {
      this.publish();
      return;
    }
    this.schedule();
  }

  protected schedule(): void {
    this.halted = false;
    this.recentlySaved = false;
    this.clearRetryTimer();
    this.entries.forEach((record) => {
      if (record.draft) record.failed = false;
    });
    this.summaries.forEach((record) => {
      if (record.draft) record.failed = false;
    });
    this.publish();
    if (this.draining) {
      void this.flush();
      return;
    }
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      void this.flush();
    }, DEBOUNCE_MS);
    if (!this.maxLatencyTimer) {
      this.maxLatencyTimer = setTimeout(() => {
        this.maxLatencyTimer = null;
        void this.flush();
      }, MAX_LATENCY_MS);
    }
  }

  protected hasSendableWork(): boolean {
    if (this.forbidden) return false;
    for (const [key, record] of this.entries) {
      if (record.draft && !this.conflicts.has(key) && !this.rejectedCells.has(key)) return true;
    }
    for (const [studentId, record] of this.summaries) {
      if (record.draft && !this.conflicts.has(summaryConflictKey(studentId))) return true;
    }
    return false;
  }

  protected hasUnsettledWork(): boolean {
    return this.countUnsettledRecords() > 0;
  }

  protected countUnsettledRecords(): number {
    let total: number = 0;
    this.entries.forEach((record) => {
      if (record.draft || record.inFlight) total += 1;
    });
    this.summaries.forEach((record) => {
      if (record.draft || record.inFlight) total += 1;
    });
    return total;
  }

  protected clearEditTimers(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    if (this.maxLatencyTimer) clearTimeout(this.maxLatencyTimer);
    this.debounceTimer = null;
    this.maxLatencyTimer = null;
  }

  protected clearRetryTimer(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  protected publish(): void {
    this.snapshot = null;
    this.revision += 1;
    if (this.disposed) return;
    this.listeners.forEach((listener) => listener());
  }

  protected buildSnapshot(): JournalQueueSnapshot {
    const cellStatus: Map<string, CellSaveStatus> = new Map();
    const summaryStatus: Map<number, CellSaveStatus> = new Map();
    const counts: JournalSaveCounts = { ...EMPTY_JOURNAL_COUNTS, conflicts: this.conflicts.size };

    this.entries.forEach((record, key) => {
      const status: CellSaveStatus | undefined = this.statusOf(
        this.conflicts.has(key),
        record.failed,
        record.inFlight !== null,
        record.draft !== null,
        this.savedEntryKeys.has(key),
      );
      if (status) cellStatus.set(key, status);
      this.countRecord(counts, record.failed || this.halted, record.inFlight !== null, record.draft !== null, this.conflicts.has(key));
    });
    this.summaries.forEach((record, studentId) => {
      const isConflicted: boolean = this.conflicts.has(summaryConflictKey(studentId));
      const status: CellSaveStatus | undefined = this.statusOf(
        isConflicted,
        record.failed,
        record.inFlight !== null,
        record.draft !== null,
        this.savedSummaryIds.has(studentId),
      );
      if (status) summaryStatus.set(studentId, status);
      this.countRecord(counts, record.failed || this.halted, record.inFlight !== null, record.draft !== null, isConflicted);
    });
    if (this.refetchFailed) counts.failed = Math.max(counts.failed, 1);

    const phase: JournalSavePhase = this.derivePhase(counts);
    return {
      journalId: this.journalId,
      revision: this.revision,
      cellStatus,
      summaryStatus,
      cellRejections: new Map(this.rejectedCells),
      conflicts: this.buildConflictList(),
      phase,
      aggregateStatus: this.legacyAggregate(phase),
      counts,
      hasPending: this.hasPending(),
      draining: this.draining,
      refetching: this.refetching,
      forbidden: this.forbidden,
    };
  }

  protected statusOf(
    isConflicted: boolean,
    isFailed: boolean,
    isInFlight: boolean,
    hasDraft: boolean,
    isRecentlySaved: boolean,
  ): CellSaveStatus | undefined {
    if (isConflicted) return "conflict";
    if (isFailed && hasDraft) return "error";
    if (isInFlight) return "saving";
    if (hasDraft) return "dirty";
    if (isRecentlySaved) return "saved";
    return undefined;
  }

  protected countRecord(
    counts: JournalSaveCounts,
    isFailed: boolean,
    isInFlight: boolean,
    hasDraft: boolean,
    isConflicted: boolean,
  ): void {
    if (isConflicted) return;
    if (isInFlight) counts.saving += 1;
    if (hasDraft && isFailed) counts.failed += 1;
    else if (hasDraft && !isInFlight) counts.unsaved += 1;
  }

  protected derivePhase(counts: JournalSaveCounts): JournalSavePhase {
    if (counts.conflicts > 0) return "conflict";
    if (counts.failed > 0) return "failed";
    if (counts.saving > 0) return "saving";
    if (counts.unsaved > 0) return "unsaved";
    if (this.recentlySaved) return "saved";
    return "idle";
  }

  protected legacyAggregate(phase: JournalSavePhase): AggregateSaveStatus {
    if (phase === "conflict" || phase === "failed") return "error";
    if (phase === "saving") return "saving";
    if (phase === "unsaved") return "pending";
    if (phase === "saved") return "saved";
    return "idle";
  }

  protected buildConflictList(): JournalAutosaveConflict[] {
    const list: JournalAutosaveConflict[] = [];
    this.conflicts.forEach((conflict) => {
      if (conflict.type === "summary") {
        const record: SummaryRecord | undefined = this.summaries.get(conflict.studentId);
        list.push({
          type: "summary",
          student_id: conflict.studentId,
          submitted_version: conflict.submittedVersion,
          current: conflict.current as JournalStudentSummaryResponse | null | undefined,
          mine: record ? (record.draft ?? record.inFlight?.value ?? null) : null,
        });
        return;
      }
      const record: EntryRecord | undefined = this.entries.get(entryKey(conflict.studentId, conflict.lessonDate));
      list.push({
        type: "entry",
        student_id: conflict.studentId,
        lesson_date: conflict.lessonDate,
        submitted_version: conflict.submittedVersion,
        current: conflict.current as JournalEntryStateResponse | null | undefined,
        mine: record ? (record.draft ?? record.inFlight?.value ?? null) : null,
      });
    });
    return list;
  }
}

import type { QueryClient } from "@tanstack/react-query";
import { AuthApiError, NetworkError } from "../auth/errors";
import { batchUpdateJournalEntries, getJournal, updateJournalStudentSummary } from "./endpoints";
import {
  JournalEntryCommands,
  JournalSummaryCommands,
  type JournalEntryCommand,
  type JournalEntryValue,
  type JournalSummaryField,
  type JournalSummaryValue,
} from "./journalCommands";
import { JournalDetailCache } from "./journalDetailCache";
import {
  EMPTY_JOURNAL_COUNTS,
  summaryConflictKey,
  type AggregateSaveStatus,
  type CellSaveStatus,
  type JournalAutosaveConflict,
  type JournalDiscardResult,
  type JournalDrainResult,
  type JournalQueueApi,
  type JournalQueueSnapshot,
  type JournalSavePhase,
  type JournalSaveCounts,
} from "./journalQueueTypes";
import {
  entryKey,
  type JournalBatchUpdateResponse,
  type JournalDetailResponse,
  type JournalEmbeddedSummary,
  type JournalEntryConflictResponse,
  type JournalEntryResponse,
  type JournalEntryStateResponse,
  type JournalEntryUpdate,
  type JournalStudentSummaryResponse,
} from "./types";

export const DEBOUNCE_MS: number = 700;
export const MAX_LATENCY_MS: number = 3000;
export const BACKOFF_DELAYS_MS: readonly number[] = [1000, 3000, 8000];
const ENTRY_SAVED_MARKER_MS: number = 1500;
const SAVED_PHASE_MS: number = 2000;
const DERIVED_REFRESH_MS: number = 2000;

export const DEFAULT_JOURNAL_QUEUE_API: JournalQueueApi = {
  batchUpdate: (journalId, payload) => batchUpdateJournalEntries(journalId, payload),
  updateSummary: (journalId, studentId, payload) => updateJournalStudentSummary(journalId, studentId, payload),
  fetchJournal: (journalId) => getJournal(journalId),
};

interface EntryRecord {
  key: string;
  studentId: number;
  lessonDate: string;
  confirmed: JournalEntryValue | undefined;
  version: number;
  draft: JournalEntryValue | null;
  inFlight: { value: JournalEntryValue; version: number } | null;
  failed: boolean;
}

interface SummaryRecord {
  studentId: number;
  confirmed: JournalSummaryValue | undefined;
  version: number;
  draft: JournalSummaryValue | null;
  inFlight: { value: JournalSummaryValue; version: number } | null;
  failed: boolean;
}

interface ConflictRecord {
  type: "entry" | "summary";
  studentId: number;
  lessonDate: string;
  submittedVersion: number;
  current: JournalEntryStateResponse | JournalStudentSummaryResponse | null | undefined;
}

type CycleOutcome = "ok" | "conflict" | "terminal" | "transient";

interface CycleTally {
  conflict: boolean;
  blockedByNewerDraft: boolean;
  terminal: boolean;
  transient: boolean;
  affectedEntryKeys: Set<string>;
  affectedSummaryIds: Set<number>;
  summaryConflictCreated: boolean;
}

class JournalRequestErrors {
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

  private static statusOf(error: unknown): number | undefined {
    if (error instanceof AuthApiError) return error.status;
    if (typeof error === "object" && error !== null && "status" in error) {
      const status: unknown = (error as { status: unknown }).status;
      return typeof status === "number" ? status : undefined;
    }
    return undefined;
  }
}

function entryValueOf(entry: JournalEntryResponse | JournalEntryStateResponse): JournalEntryValue {
  return { attendance: entry.attendance, score: entry.score, comment: entry.comment ?? null };
}

function summaryValueOf(summary: JournalEmbeddedSummary | JournalStudentSummaryResponse): JournalSummaryValue {
  return { bonus_score: summary.bonus_score, exam_score: summary.exam_score };
}

function emptyTally(): CycleTally {
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

export class JournalQueueOwner {
  readonly journalId: number;
  readonly courseId: number | undefined;

  private readonly queryClient: QueryClient;
  private readonly api: JournalQueueApi;
  private readonly cache: JournalDetailCache;

  private readonly entries: Map<string, EntryRecord> = new Map();
  private readonly summaries: Map<number, SummaryRecord> = new Map();
  private readonly conflicts: Map<string, ConflictRecord> = new Map();
  private readonly savedEntryKeys: Set<string> = new Set();
  private readonly savedSummaryIds: Set<number> = new Set();
  private readonly listeners: Set<() => void> = new Set();

  private activeFlush: Promise<void> | null = null;
  private lastOutcome: CycleOutcome = "ok";
  private acknowledgedInRun: boolean = false;
  private halted: boolean = false;
  private forbidden: boolean = false;
  private uncertain: boolean = false;
  private recentlySaved: boolean = false;
  private draining: boolean = false;
  private refetching: boolean = false;
  private refetchFailed: boolean = false;
  private disposed: boolean = false;
  private retryCount: number = 0;
  private revision: number = 0;
  private snapshot: JournalQueueSnapshot | null = null;

  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private maxLatencyTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private savedPhaseTimer: ReturnType<typeof setTimeout> | null = null;
  private derivedRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly savedMarkerTimers: Set<ReturnType<typeof setTimeout>> = new Set();
  private readonly stopWatchingCache: () => void;

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

  applyEntryCommand(studentId: number, lessonDate: string, command: JournalEntryCommand): void {
    const record: EntryRecord = this.entryRecord(studentId, lessonDate);
    const current: JournalEntryValue = this.effectiveEntry(record);
    const next: JournalEntryValue = JournalEntryCommands.apply(current, command);
    this.stageEntry(record, next, record.version);
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

  private entryRecord(studentId: number, lessonDate: string): EntryRecord {
    const key: string = entryKey(studentId, lessonDate);
    const existing: EntryRecord | undefined = this.entries.get(key);
    if (existing) return existing;
    const cached: JournalEntryResponse | undefined = this.cache.readEntry(studentId, lessonDate);
    const created: EntryRecord = {
      key,
      studentId,
      lessonDate,
      confirmed: cached ? entryValueOf(cached) : undefined,
      version: cached?.version ?? 0,
      draft: null,
      inFlight: null,
      failed: false,
    };
    this.entries.set(key, created);
    return created;
  }

  private summaryRecord(studentId: number): SummaryRecord | null {
    const existing: SummaryRecord | undefined = this.summaries.get(studentId);
    if (existing) return existing;
    const cached: JournalEmbeddedSummary | null | undefined = this.cache.readSummary(studentId);
    if (!cached) return null;
    return this.summaryRecordOrCreate(studentId, cached.version);
  }

  private summaryRecordOrCreate(studentId: number, fallbackVersion: number): SummaryRecord {
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

  private effectiveEntry(record: EntryRecord): JournalEntryValue {
    return record.draft ?? record.inFlight?.value ?? record.confirmed ?? { attendance: false, score: 0, comment: null };
  }

  private effectiveSummary(record: SummaryRecord): JournalSummaryValue {
    return record.draft ?? record.inFlight?.value ?? record.confirmed ?? { bonus_score: 0, exam_score: 0 };
  }

  private stageEntry(record: EntryRecord, next: JournalEntryValue, minimumVersion: number): void {
    record.version = Math.max(record.version, minimumVersion);
    const matchesConfirmed: boolean =
      record.confirmed !== undefined && JournalEntryCommands.areEqual(next, record.confirmed);
    if (matchesConfirmed && !record.inFlight && !record.draft && !this.conflicts.has(record.key)) return;
    record.draft = matchesConfirmed && !record.inFlight && !this.conflicts.has(record.key) ? null : next;
    record.failed = false;
    this.savedEntryKeys.delete(record.key);
    this.cache.writeEntry(record.studentId, record.lessonDate, next, record.version);
    this.afterStaging(this.conflicts.has(record.key));
  }

  private stageSummary(record: SummaryRecord, next: JournalSummaryValue, minimumVersion: number): void {
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

  private afterStaging(isConflicted: boolean): void {
    if (isConflicted) {
      this.publish();
      return;
    }
    this.schedule();
  }

  private schedule(): void {
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

  private hasSendableWork(): boolean {
    if (this.forbidden) return false;
    for (const [key, record] of this.entries) {
      if (record.draft && !this.conflicts.has(key)) return true;
    }
    for (const [studentId, record] of this.summaries) {
      if (record.draft && !this.conflicts.has(summaryConflictKey(studentId))) return true;
    }
    return false;
  }

  private hasUnsettledWork(): boolean {
    return this.countUnsettledRecords() > 0;
  }

  private countUnsettledRecords(): number {
    let total: number = 0;
    this.entries.forEach((record) => {
      if (record.draft || record.inFlight) total += 1;
    });
    this.summaries.forEach((record) => {
      if (record.draft || record.inFlight) total += 1;
    });
    return total;
  }

  private async runCycles(): Promise<void> {
    this.acknowledgedInRun = false;
    for (;;) {
      const claimedEntryKeys: string[] = [];
      const claimedSummaryIds: number[] = [];
      this.entries.forEach((record, key) => {
        if (record.draft && !this.conflicts.has(key)) {
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
        if (outcome === "conflict") this.refreshUnknownSummaryConflicts();
        return;
      }
    }
  }

  private async sendClaimed(entryKeys: string[], summaryIds: number[]): Promise<CycleOutcome> {
    const tally: CycleTally = emptyTally();
    if (entryKeys.length > 0) await this.sendEntries(entryKeys, tally);
    for (const studentId of summaryIds) {
      await this.sendSummary(studentId, tally);
    }
    return this.settleCycle(tally);
  }

  private async sendEntries(entryKeys: string[], tally: CycleTally): Promise<void> {
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

  private absorbBatchResponse(response: JournalBatchUpdateResponse | undefined, tally: CycleTally): void {
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

  private absorbAppliedEntry(item: JournalEntryStateResponse): void {
    const record: EntryRecord = this.entryRecord(item.student_id, item.lesson_date);
    const appliedValue: JournalEntryValue = entryValueOf(item);
    record.version = Math.max(record.version, item.version);
    record.confirmed = appliedValue;
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

  private absorbRejectedEntry(item: JournalEntryConflictResponse, tally: CycleTally): void {
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

  private absorbDerivedSummary(item: JournalStudentSummaryResponse): void {
    const record: SummaryRecord = this.summaryRecordOrCreate(item.student_id, item.version);
    record.version = Math.max(record.version, item.version);
    if (!record.draft && !record.inFlight) record.confirmed = summaryValueOf(item);
    this.cache.writeServerSummary(item, record.draft ?? record.inFlight?.value ?? null, record.version);
  }

  private absorbEntryFailure(error: unknown, tally: CycleTally): void {
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
    tally.terminal = true;
    if (JournalRequestErrors.isForbidden(error)) this.forbidden = true;
    tally.affectedEntryKeys.forEach((key) => {
      const record: EntryRecord | undefined = this.entries.get(key);
      if (record?.draft) record.failed = true;
    });
  }

  private restoreInFlightEntry(record: EntryRecord): boolean {
    const hadNewerDraft: boolean = record.draft !== null;
    if (!hadNewerDraft && record.inFlight) record.draft = record.inFlight.value;
    record.inFlight = null;
    return hadNewerDraft;
  }

  private async sendSummary(studentId: number, tally: CycleTally): Promise<void> {
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

  private settleCycle(tally: CycleTally): CycleOutcome {
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

  private markAffectedFailed(tally: CycleTally): void {
    tally.affectedEntryKeys.forEach((key) => {
      const record: EntryRecord | undefined = this.entries.get(key);
      if (record?.draft) record.failed = true;
    });
    tally.affectedSummaryIds.forEach((studentId) => {
      const record: SummaryRecord | undefined = this.summaries.get(studentId);
      if (record?.draft) record.failed = true;
    });
  }

  private settleQuietly(): void {
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

  private markEntrySaved(key: string): void {
    this.savedEntryKeys.add(key);
    const timer: ReturnType<typeof setTimeout> = setTimeout(() => {
      this.savedMarkerTimers.delete(timer);
      this.savedEntryKeys.delete(key);
      this.publish();
    }, ENTRY_SAVED_MARKER_MS);
    this.savedMarkerTimers.add(timer);
  }

  private markSummarySaved(studentId: number): void {
    this.savedSummaryIds.add(studentId);
    const timer: ReturnType<typeof setTimeout> = setTimeout(() => {
      this.savedMarkerTimers.delete(timer);
      this.savedSummaryIds.delete(studentId);
      this.publish();
    }, ENTRY_SAVED_MARKER_MS);
    this.savedMarkerTimers.add(timer);
  }

  private scheduleDerivedRefresh(): void {
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

  private resolveEntryConflict(stored: ConflictRecord, choice: "keepMine" | "keepTheirs"): void {
    const key: string = entryKey(stored.studentId, stored.lessonDate);
    const record: EntryRecord = this.entryRecord(stored.studentId, stored.lessonDate);
    const current: JournalEntryStateResponse | null = stored.current as JournalEntryStateResponse | null;

    if (choice === "keepMine" && current) {
      this.conflicts.delete(key);
      record.version = current.version;
      record.confirmed = entryValueOf(current);
      if (record.draft) {
        this.cache.writeEntry(record.studentId, record.lessonDate, record.draft, record.version);
        this.schedule();
        return;
      }
      this.cache.writeEntry(record.studentId, record.lessonDate, record.confirmed, record.version);
      this.publish();
      return;
    }

    this.conflicts.delete(key);
    record.draft = null;
    record.failed = false;
    this.savedEntryKeys.delete(key);
    if (current) {
      record.confirmed = entryValueOf(current);
      record.version = current.version;
      this.cache.writeEntry(record.studentId, record.lessonDate, record.confirmed, record.version);
    } else {
      this.entries.delete(key);
      this.cache.removeEntry(stored.studentId, stored.lessonDate);
    }
    this.afterUseServer();
  }

  private resolveSummaryConflict(stored: ConflictRecord, choice: "keepMine" | "keepTheirs"): void {
    const key: string = summaryConflictKey(stored.studentId);
    const record: SummaryRecord = this.summaryRecordOrCreate(stored.studentId, stored.submittedVersion);
    const current: JournalStudentSummaryResponse | null = stored.current as JournalStudentSummaryResponse | null;

    if (choice === "keepMine" && current) {
      this.conflicts.delete(key);
      record.version = current.version;
      record.confirmed = summaryValueOf(current);
      if (record.draft) {
        this.cache.writeServerSummary(current, record.draft, record.version);
        this.schedule();
        return;
      }
      this.cache.writeServerSummary(current, null, record.version);
      this.publish();
      return;
    }

    this.conflicts.delete(key);
    record.draft = null;
    record.failed = false;
    this.savedSummaryIds.delete(stored.studentId);
    if (current) {
      record.confirmed = summaryValueOf(current);
      record.version = current.version;
      this.cache.writeServerSummary(current, null, record.version);
    } else {
      this.summaries.delete(stored.studentId);
      this.cache.writeSummaryAbsent(stored.studentId);
    }
    this.afterUseServer();
  }

  private afterUseServer(): void {
    if (this.conflicts.size === 0 && this.hasSendableWork()) {
      this.schedule();
      return;
    }
    this.publish();
  }

  private async refetchAuthoritative(): Promise<JournalDetailResponse | null> {
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

  private refreshUnknownSummaryConflicts(): void {
    const hasUnknownSummary: boolean = Array.from(this.conflicts.values()).some(
      (conflict) => conflict.type === "summary" && conflict.current === undefined,
    );
    if (!hasUnknownSummary) return;
    void this.refetchAuthoritative().then((fresh) => {
      if (fresh && !this.disposed) this.reconcileWithServer(fresh);
    });
  }

  private reconcileWithServer(fresh: JournalDetailResponse): void {
    this.uncertain = false;

    this.entries.forEach((record, key) => {
      const serverEntry: JournalEntryResponse | undefined = fresh.students
        .find((student) => student.student_id === record.studentId)
        ?.entries.find((entry) => entry.lesson_date === record.lessonDate);

      if (!record.draft && !record.inFlight) {
        if (serverEntry) {
          record.confirmed = entryValueOf(serverEntry);
          record.version = Math.max(record.version, serverEntry.version);
        }
        return;
      }
      if (!record.draft) return;

      if (!serverEntry) {
        this.conflicts.set(key, this.entryConflictFor(record, null));
        return;
      }
      const serverValue: JournalEntryValue = entryValueOf(serverEntry);
      record.confirmed = serverValue;
      if (JournalEntryCommands.areEqual(record.draft, serverValue)) {
        record.draft = null;
        record.failed = false;
        record.version = Math.max(record.version, serverEntry.version);
        this.conflicts.delete(key);
        return;
      }
      const serverMovedOn: boolean = serverEntry.version !== record.version;
      if (serverMovedOn || this.conflicts.has(key)) {
        this.conflicts.set(key, this.entryConflictFor(record, this.stateOf(record, serverEntry)));
      }
    });

    this.summaries.forEach((record, studentId) => {
      const serverSummary: JournalEmbeddedSummary | null | undefined = fresh.students.find(
        (student) => student.student_id === studentId,
      )?.summary;
      const key: string = summaryConflictKey(studentId);

      if (!record.draft && !record.inFlight) {
        if (serverSummary) {
          record.confirmed = summaryValueOf(serverSummary);
          record.version = Math.max(record.version, serverSummary.version);
        }
        return;
      }
      if (!record.draft) return;

      if (!serverSummary) {
        this.conflicts.set(key, this.summaryConflictFor(record, null));
        return;
      }
      const serverValue: JournalSummaryValue = summaryValueOf(serverSummary);
      record.confirmed = serverValue;
      if (JournalSummaryCommands.areEqual(record.draft, serverValue)) {
        record.draft = null;
        record.failed = false;
        record.version = Math.max(record.version, serverSummary.version);
        this.conflicts.delete(key);
        return;
      }
      const serverMovedOn: boolean = serverSummary.version !== record.version;
      if (serverMovedOn || this.conflicts.has(key)) {
        this.conflicts.set(key, this.summaryConflictFor(record, this.fullSummaryOf(serverSummary, studentId)));
      }
    });

    this.cache.replace(this.overlayLocalWork(fresh).detail);
    this.publish();
  }

  private stateOf(record: EntryRecord, serverEntry: JournalEntryResponse): JournalEntryStateResponse {
    return {
      student_id: record.studentId,
      lesson_date: record.lessonDate,
      attendance: serverEntry.attendance,
      score: serverEntry.score,
      comment: serverEntry.comment,
      version: serverEntry.version,
    };
  }

  private fullSummaryOf(summary: JournalEmbeddedSummary, studentId: number): JournalStudentSummaryResponse {
    return {
      id: summary.id,
      journal_id: summary.journal_id ?? this.journalId,
      student_id: summary.student_id ?? studentId,
      homework_score: summary.homework_score,
      attendance_score: summary.attendance_score,
      exam_score: summary.exam_score,
      bonus_score: summary.bonus_score,
      sum_score: summary.sum_score,
      max_period_score: summary.max_period_score,
      percentage: summary.percentage,
      attendance_count: summary.attendance_count,
      total_lessons: summary.total_lessons,
      version: summary.version,
    };
  }

  private entryConflictFor(record: EntryRecord, current: JournalEntryStateResponse | null): ConflictRecord {
    return {
      type: "entry",
      studentId: record.studentId,
      lessonDate: record.lessonDate,
      submittedVersion: record.version,
      current,
    };
  }

  private summaryConflictFor(record: SummaryRecord, current: JournalStudentSummaryResponse | null): ConflictRecord {
    return {
      type: "summary",
      studentId: record.studentId,
      lessonDate: "",
      submittedVersion: record.version,
      current,
    };
  }

  private overlayLocalWork(detail: JournalDetailResponse): { detail: JournalDetailResponse; changed: boolean } {
    let changed: boolean = false;
    const students = detail.students.map((student) => {
      let nextStudent = student;

      student.entries.forEach((entry) => {
        const record: EntryRecord | undefined = this.entries.get(entryKey(student.student_id, entry.lesson_date));
        const value: JournalEntryValue | undefined = record ? (record.draft ?? record.inFlight?.value) : undefined;
        if (!record || !value) return;
        const alreadyApplied: boolean =
          JournalEntryCommands.areEqual(entryValueOf(entry), value) && entry.version === record.version;
        if (alreadyApplied) return;
        changed = true;
        nextStudent = {
          ...nextStudent,
          entries: nextStudent.entries.map((candidate) =>
            candidate.lesson_date === entry.lesson_date
              ? {
                  ...candidate,
                  attendance: value.attendance,
                  score: value.score,
                  comment: value.comment,
                  has_comment: value.comment !== null && value.comment.trim().length > 0,
                  version: record.version,
                }
              : candidate,
          ),
        };
      });

      const summaryRecord: SummaryRecord | undefined = this.summaries.get(student.student_id);
      const summaryValue: JournalSummaryValue | undefined = summaryRecord
        ? (summaryRecord.draft ?? summaryRecord.inFlight?.value)
        : undefined;
      if (summaryRecord && summaryValue && student.summary) {
        const alreadyApplied: boolean =
          JournalSummaryCommands.areEqual(summaryValueOf(student.summary), summaryValue) &&
          student.summary.version === summaryRecord.version;
        if (!alreadyApplied) {
          changed = true;
          nextStudent = {
            ...nextStudent,
            summary: {
              ...student.summary,
              bonus_score: summaryValue.bonus_score,
              exam_score: summaryValue.exam_score,
              version: summaryRecord.version,
            },
          };
        }
      }
      return nextStudent;
    });
    return { detail: changed ? { ...detail, students } : detail, changed };
  }

  private reapplyLocalWork(): void {
    const detail: JournalDetailResponse | undefined = this.cache.read();
    if (!detail) return;
    this.entries.forEach((record) => {
      if (record.draft || record.inFlight || this.conflicts.has(record.key)) return;
      const cached: JournalEntryResponse | undefined = this.cache.readEntry(record.studentId, record.lessonDate);
      if (!cached) return;
      record.confirmed = entryValueOf(cached);
      record.version = Math.max(record.version, cached.version);
    });
    this.summaries.forEach((record) => {
      if (record.draft || record.inFlight || this.conflicts.has(summaryConflictKey(record.studentId))) return;
      const cached: JournalEmbeddedSummary | null | undefined = this.cache.readSummary(record.studentId);
      if (!cached) return;
      record.confirmed = summaryValueOf(cached);
      record.version = Math.max(record.version, cached.version);
    });
    const overlaid = this.overlayLocalWork(detail);
    if (overlaid.changed) this.cache.replace(overlaid.detail);
  }

  private revertLocalWork(fresh: JournalDetailResponse | null): void {
    if (fresh) {
      this.entries.clear();
      this.summaries.clear();
      this.conflicts.clear();
      this.savedEntryKeys.clear();
      this.savedSummaryIds.clear();
      this.cache.replace(fresh);
      return;
    }
    const revertedEntries: Array<{ record: EntryRecord; conflict: ConflictRecord | undefined }> = [];
    this.entries.forEach((record, key) => {
      if (record.draft || this.conflicts.has(key)) revertedEntries.push({ record, conflict: this.conflicts.get(key) });
    });
    const revertedSummaries: Array<{ record: SummaryRecord; conflict: ConflictRecord | undefined }> = [];
    this.summaries.forEach((record, studentId) => {
      const key: string = summaryConflictKey(studentId);
      if (record.draft || this.conflicts.has(key)) revertedSummaries.push({ record, conflict: this.conflicts.get(key) });
    });
    revertedEntries.forEach(({ record }) => this.entries.delete(record.key));
    revertedSummaries.forEach(({ record }) => this.summaries.delete(record.studentId));
    this.conflicts.clear();

    revertedEntries.forEach(({ record, conflict }) => {
      const serverState = conflict?.current as JournalEntryStateResponse | null | undefined;
      if (serverState === null) {
        this.cache.removeEntry(record.studentId, record.lessonDate);
      } else if (serverState) {
        this.cache.writeEntry(record.studentId, record.lessonDate, entryValueOf(serverState), serverState.version);
      } else if (record.confirmed) {
        this.cache.writeEntry(record.studentId, record.lessonDate, record.confirmed, record.version);
      }
    });
    revertedSummaries.forEach(({ record, conflict }) => {
      const serverState = conflict?.current as JournalStudentSummaryResponse | null | undefined;
      if (serverState === null) {
        this.cache.writeSummaryAbsent(record.studentId);
      } else if (serverState) {
        this.cache.writeServerSummary(serverState, null, serverState.version);
      } else if (record.confirmed) {
        this.cache.writeSummaryDraft(record.studentId, record.confirmed, record.version);
      }
    });
  }

  private clearEditTimers(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    if (this.maxLatencyTimer) clearTimeout(this.maxLatencyTimer);
    this.debounceTimer = null;
    this.maxLatencyTimer = null;
  }

  private clearRetryTimer(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  private publish(): void {
    this.snapshot = null;
    this.revision += 1;
    if (this.disposed) return;
    this.listeners.forEach((listener) => listener());
  }

  private buildSnapshot(): JournalQueueSnapshot {
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

  private statusOf(
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

  private countRecord(
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

  private derivePhase(counts: JournalSaveCounts): JournalSavePhase {
    if (counts.conflicts > 0) return "conflict";
    if (counts.failed > 0) return "failed";
    if (counts.saving > 0) return "saving";
    if (counts.unsaved > 0) return "unsaved";
    if (this.recentlySaved) return "saved";
    return "idle";
  }

  private legacyAggregate(phase: JournalSavePhase): AggregateSaveStatus {
    if (phase === "conflict" || phase === "failed") return "error";
    if (phase === "saving") return "saving";
    if (phase === "unsaved") return "pending";
    if (phase === "saved") return "saved";
    return "idle";
  }

  private buildConflictList(): JournalAutosaveConflict[] {
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

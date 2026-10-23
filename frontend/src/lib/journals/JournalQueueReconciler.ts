import {
  JournalEntryCommands,
  JournalSummaryCommands,
  type JournalEntryValue,
  type JournalSummaryValue,
} from "./journalCommands";
import { summaryConflictKey } from "./journalQueueTypes";
import {
  entryKey,
  type JournalDetailResponse,
  type JournalEmbeddedSummary,
  type JournalEntryResponse,
  type JournalEntryStateResponse,
  type JournalStudentSummaryResponse,
} from "./types";
import {
  entryValueOf,
  isGradedState,
  summaryValueOf,
  type ConflictRecord,
  type EntryRecord,
  type SummaryRecord,
} from "./journalQueueRecords";
import { JournalQueueSender } from "./JournalQueueSender";

export abstract class JournalQueueReconciler extends JournalQueueSender {
  protected resolveEntryConflict(stored: ConflictRecord, choice: "keepMine" | "keepTheirs"): void {
    const key: string = entryKey(stored.studentId, stored.lessonDate);
    const record: EntryRecord = this.entryRecord(stored.studentId, stored.lessonDate);
    const current: JournalEntryStateResponse | null = stored.current as JournalEntryStateResponse | null;

    if (choice === "keepMine" && current) {
      this.conflicts.delete(key);
      record.version = current.version;
      record.confirmed = entryValueOf(current);
      record.confirmedGraded = isGradedState(current);
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
      record.confirmedGraded = isGradedState(current);
      record.version = current.version;
      this.cache.writeEntry(record.studentId, record.lessonDate, record.confirmed, record.version, record.confirmedGraded);
    } else {
      this.entries.delete(key);
      this.cache.removeEntry(stored.studentId, stored.lessonDate);
    }
    this.afterUseServer();
  }

  protected resolveSummaryConflict(stored: ConflictRecord, choice: "keepMine" | "keepTheirs"): void {
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

  protected afterUseServer(): void {
    if (this.conflicts.size === 0 && this.hasSendableWork()) {
      this.schedule();
      return;
    }
    this.publish();
  }

  protected reconcileWithServer(fresh: JournalDetailResponse): void {
    this.uncertain = false;

    this.entries.forEach((record, key) => {
      const serverEntry: JournalEntryResponse | undefined = fresh.students
        .find((student) => student.student_id === record.studentId)
        ?.entries.find((entry) => entry.lesson_date === record.lessonDate);

      if (!record.draft && !record.inFlight) {
        if (serverEntry) {
          record.confirmed = entryValueOf(serverEntry);
          record.confirmedGraded = isGradedState(serverEntry);
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
      record.confirmedGraded = isGradedState(serverEntry);
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

  protected stateOf(record: EntryRecord, serverEntry: JournalEntryResponse): JournalEntryStateResponse {
    return {
      student_id: record.studentId,
      lesson_date: record.lessonDate,
      attendance: serverEntry.attendance,
      score: serverEntry.score,
      comment: serverEntry.comment,
      is_graded: serverEntry.is_graded,
      version: serverEntry.version,
    };
  }

  protected fullSummaryOf(summary: JournalEmbeddedSummary, studentId: number): JournalStudentSummaryResponse {
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

  protected entryConflictFor(record: EntryRecord, current: JournalEntryStateResponse | null): ConflictRecord {
    return {
      type: "entry",
      studentId: record.studentId,
      lessonDate: record.lessonDate,
      submittedVersion: record.version,
      current,
    };
  }

  protected summaryConflictFor(record: SummaryRecord, current: JournalStudentSummaryResponse | null): ConflictRecord {
    return {
      type: "summary",
      studentId: record.studentId,
      lessonDate: "",
      submittedVersion: record.version,
      current,
    };
  }

  protected overlayLocalWork(detail: JournalDetailResponse): { detail: JournalDetailResponse; changed: boolean } {
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
                  is_graded: true,
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

  protected reapplyLocalWork(): void {
    const detail: JournalDetailResponse | undefined = this.cache.read();
    if (!detail) return;
    this.entries.forEach((record) => {
      if (record.draft || record.inFlight || this.conflicts.has(record.key)) return;
      const cached: JournalEntryResponse | undefined = this.cache.readEntry(record.studentId, record.lessonDate);
      if (!cached) return;
      record.confirmed = entryValueOf(cached);
      record.confirmedGraded = isGradedState(cached);
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

  protected revertLocalWork(fresh: JournalDetailResponse | null): void {
    if (fresh) {
      this.entries.clear();
      this.summaries.clear();
      this.conflicts.clear();
      this.rejectedCells.clear();
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
    this.rejectedCells.clear();

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
}

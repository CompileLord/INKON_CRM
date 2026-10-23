import { vi, type Mock } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import type {
  JournalBatchUpdateResponse,
  JournalDetailResponse,
  JournalEntryStateResponse,
  JournalStudentSummaryResponse,
} from "./types";
import type { JournalQueueApi } from "./journalQueueTypes";

export interface FakeJournalApi extends JournalQueueApi {
  batchUpdate: Mock<JournalQueueApi["batchUpdate"]>;
  updateSummary: Mock<JournalQueueApi["updateSummary"]>;
  fetchJournal: Mock<JournalQueueApi["fetchJournal"]>;
}

export interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}

export function createDeferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => undefined;
  let reject: (reason?: unknown) => void = () => undefined;
  const promise: Promise<T> = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

export function createFakeApi(): FakeJournalApi {
  return {
    batchUpdate: vi.fn<JournalQueueApi["batchUpdate"]>(),
    updateSummary: vi.fn<JournalQueueApi["updateSummary"]>(),
    fetchJournal: vi.fn<JournalQueueApi["fetchJournal"]>(),
  };
}

export const FIRST_DATE: string = "2026-08-01";
export const SECOND_DATE: string = "2026-08-02";

export function buildDetail(journalId: number = 1, courseId: number = 10): JournalDetailResponse {
  const summary = (id: number, studentId: number) => ({
    id,
    journal_id: journalId,
    student_id: studentId,
    bonus_score: 0,
    exam_score: 0,
    version: 1,
    homework_score: 0,
    attendance_score: 0,
    sum_score: 0,
    max_period_score: 100,
    percentage: 0,
    attendance_count: 0,
    total_lessons: 2,
  });
  const entry = (id: number, lessonDate: string) => ({
    id,
    lesson_date: lessonDate,
    attendance: false,
    score: 0,
    comment: null,
    has_comment: false,
    is_graded: false,
    version: 1,
  });
  return {
    journal_id: journalId,
    course_id: courseId,
    period_label: "Week 1",
    period_start: FIRST_DATE,
    period_end: "2026-08-07",
    period_type: "week",
    exam_max_score: 100,
    lesson_dates: [FIRST_DATE, SECOND_DATE],
    students: [
      {
        student_id: 101,
        first_name: "Student",
        last_name: "One",
        email: "s1@example.com",
        color_hex: "#000",
        entries: [entry(1, FIRST_DATE), entry(2, SECOND_DATE)],
        summary: summary(1, 101),
      },
      {
        student_id: 102,
        first_name: "Student",
        last_name: "Two",
        email: "s2@example.com",
        color_hex: "#000",
        entries: [entry(3, FIRST_DATE)],
        summary: summary(2, 102),
      },
    ],
  };
}

export function createQueryClientWith(detail: JournalDetailResponse): QueryClient {
  const queryClient: QueryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  queryClient.setQueryData(["journals", "detail", detail.journal_id], detail);
  return queryClient;
}

export function stateOf(
  studentId: number,
  lessonDate: string,
  overrides: Partial<JournalEntryStateResponse>,
): JournalEntryStateResponse {
  return { student_id: studentId, lesson_date: lessonDate, attendance: false, score: 0, comment: null, version: 2, ...overrides };
}

export function appliedResponse(...applied: JournalEntryStateResponse[]): JournalBatchUpdateResponse {
  return { applied, conflicts: [], summaries: [] };
}

export function summaryResult(
  studentId: number,
  overrides: Partial<JournalStudentSummaryResponse>,
): JournalStudentSummaryResponse {
  return {
    id: studentId === 101 ? 1 : 2,
    journal_id: 1,
    student_id: studentId,
    homework_score: 0,
    attendance_score: 0,
    exam_score: 0,
    bonus_score: 0,
    sum_score: 0,
    max_period_score: 100,
    percentage: 0,
    attendance_count: 0,
    total_lessons: 2,
    version: 2,
    ...overrides,
  };
}

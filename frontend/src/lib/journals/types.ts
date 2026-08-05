/**
 * Request/response models for /api/v1/journals/*.
 *
 * The live shape of `GET /journals/{id}` is defined by
 * `backend/app/services/journal_service.py: JournalService.get_journal`.
 */

export type JournalPeriodType = "week" | "month";

export interface JournalEntryUpdate {
  student_id: number;
  lesson_date: string;
  attendance: boolean;
  score: number;
  comment?: string | null;
  version: number;
}

export interface JournalStudentSummaryUpdate {
  exam_score: number;
  bonus_score: number;
  version: number;
}

export interface JournalExamMaxScoreUpdate {
  exam_max_score: number;
}

export interface JournalStudentSummaryResponse {
  id: number;
  journal_id: number;
  student_id: number;
  homework_score: number;
  attendance_score: number;
  exam_score: number;
  bonus_score: number;
  sum_score: number;
  max_period_score: number;
  percentage: number;
  attendance_count: number;
  total_lessons: number;
  version: number;
}

export interface JournalEntryResponse {
  id: number;
  lesson_date: string;
  attendance: boolean;
  score: number;
  comment: string | null;
  has_comment: boolean;
  version: number;
}

export interface JournalEmbeddedSummary {
  id: number;
  journal_id?: number;
  student_id?: number;
  homework_score: number;
  attendance_score: number;
  exam_score: number;
  bonus_score: number;
  sum_score: number;
  max_period_score: number;
  percentage: number;
  attendance_count: number;
  total_lessons: number;
  version: number;
}

export interface JournalStudentResponse {
  student_id: number;
  first_name: string;
  last_name: string;
  email: string;
  color_hex: string;
  entries: JournalEntryResponse[];
  summary: JournalEmbeddedSummary | null;
}

export interface JournalDetailResponse {
  journal_id: number;
  course_id: number;
  period_label: string;
  period_start: string;
  period_end: string;
  period_type: JournalPeriodType;
  exam_max_score: number;
  lesson_dates: string[];
  students: JournalStudentResponse[];
  my_rank?: number;
  class_size?: number;
  class_avg_percentage?: number;
}

export interface JournalEntryStateResponse {
  student_id: number;
  lesson_date: string;
  attendance: boolean;
  score: number;
  comment?: string | null;
  version: number;
}

export interface JournalEntryConflictResponse {
  student_id: number;
  lesson_date: string;
  submitted_version: number;
  current?: JournalEntryStateResponse | null;
}

export interface JournalBatchUpdateResponse {
  applied: JournalEntryStateResponse[];
  conflicts: JournalEntryConflictResponse[];
  summaries: JournalStudentSummaryResponse[];
}

export interface JournalExamMaxScoreUpdateResponse {
  journal: {
    id: number;
    course_id: number;
    period_label: string;
    period_start: string;
    period_end: string;
    period_type: JournalPeriodType;
    exam_max_score: number;
  };
  summaries: JournalStudentSummaryResponse[];
}

export function entryKey(studentId: number, lessonDate: string): string {
  return `${studentId}:${lessonDate}`;
}

export type { CourseJournalMetricsResponse } from "../courses/types";

export interface GradingQueueItemResponse {
  journal_id: number;
  course_id: number;
  course_title: string;
  period_label: string;
  period_start: string;
  period_end: string;
  state: "upcoming" | "empty" | "partial" | "complete";
  cells_filled: number;
  cells_expected: number;
  is_current: boolean;
}



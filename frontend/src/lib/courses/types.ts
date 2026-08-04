/**
 * Request/response models for /api/v1/courses/*, derived from
 * http://35.228.205.63:8001/api/v1/openapi.json.
 */
import type { Paginated } from "../pagination";

export type CourseExamType = "weekly" | "monthly";
export type CourseStatus = "active" | "archived";

export interface CourseScheduleCreate {
  day_of_week: number; // 0-6
  time_start: string; // "HH:MM:SS"
  time_end: string; // "HH:MM:SS"
}

export interface CourseScheduleResponse {
  id: number;
  course_id: number;
  day_of_week: number;
  time_start: string;
  time_end: string;
}

export interface CourseCreate {
  title: string;
  description: string;
  start_date: string; // date-only YYYY-MM-DD
  end_date: string; // date-only YYYY-MM-DD
  exam_type: CourseExamType;
  price: string; // arbitrary-precision decimal string — never a number
  mentor_id: number;
  schedules: CourseScheduleCreate[]; // min 1
}

/**
 * The spec's CourseUpdate has no `price`, `exam_type`, or `schedules` field
 * at all — those are immutable after creation via this endpoint, not just
 * optional. Only these six fields are patchable.
 */
export interface CourseUpdate {
  title?: string;
  description?: string;
  start_date?: string;
  end_date?: string;
  mentor_id?: number;
  status?: CourseStatus;
}

export interface CourseResponse {
  id: number;
  title: string;
  description: string;
  photo_path: string | null;
  start_date: string;
  end_date: string;
  exam_type: CourseExamType;
  price: string;
  mentor_id: number;
  status: CourseStatus;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
  schedules?: CourseScheduleResponse[];
}

export interface MentorMiniResponse {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  is_deleted: boolean;
}

export interface CourseMentorHistoryResponse {
  id: number;
  course_id: number;
  mentor_id: number;
  assigned_from: string; // date-time
  assigned_to: string | null; // date-time
  mentor: MentorMiniResponse;
}

export interface ListCoursesParams {
  status?: CourseStatus;
  page?: number;
  page_size?: number;
}

export type PaginatedCourses = Paginated<CourseResponse>;

export interface CourseProgressPeriod {
  id: number;
  period_label: string;
}

/** One score per journal in period order, plus a trailing course average. */
export interface CourseProgressChartDataset {
  student_id: number;
  name: string;
  color_hex: string;
  scores: number[];
  max_scores?: number[];
  percentages?: number[];
}

/** `labels` is one entry per journal (`period_label`) plus a trailing "Average". */
export interface CourseProgressChartResponse {
  labels: string[];
  periods?: CourseProgressPeriod[];
  datasets: CourseProgressChartDataset[];
}

export interface StudentCourseProgressChartResponse {
  periods: CourseProgressPeriod[];
  my_series: number[];
  class_avg_series: number[];
  my_rank: number;
  class_size: number;
}

export interface CourseJournalMetricsResponse {
  class_avg_percentage: number;
  attendance_rate: number;
  periods_total: number;
  periods_complete: number;
  at_risk_count: number;
  at_risk_threshold: number;
}

export type JournalPeriodType = "week" | "month";

/** A single period (week or month) that a course has been split into for attendance/grading. */
export interface JournalPeriod {
  id: number;
  course_id: number;
  period_label: string;
  period_start: string;
  period_end: string;
  period_type: JournalPeriodType;
  exam_max_score?: number;
  student_count?: number;
  lesson_count?: number;
  cells_expected?: number;
  cells_filled?: number;
  avg_percentage?: number | null;
  state?: "upcoming" | "empty" | "partial" | "complete";
}

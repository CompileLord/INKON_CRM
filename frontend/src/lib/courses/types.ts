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

export interface CourseListItemResponse extends CourseResponse {
  schedules: CourseScheduleResponse[];
  active_student_count: number;
}

export type PaginatedCourses = Paginated<CourseListItemResponse>;

export interface CourseProgressPeriod {
  id: number;
  period_label: string;
}

export type CourseChartGradingState = "missing" | "ungraded" | "unknown" | "graded" | "upcoming";

export interface CourseProgressChartDataset {
  student_id: number;
  name: string;
  color_hex: string;
  scores: (number | null)[];
  max_scores: (number | null)[];
  percentages: (number | null)[];
  grading_states: CourseChartGradingState[];
  graded_periods_count: number;
  eligible_periods_count: number;
}

export type CourseChartAggregationScope = "selected_periods";

export interface CourseProgressChartOptions {
  periodOffset?: number;
  periodLimit?: number;
  studentOffset?: number;
  studentLimit?: number;
}

export interface CourseProgressChartPeriodMetadata {
  period_offset: number;
  period_limit: number;
  periods_total: number;
  aggregation_scope: CourseChartAggregationScope;
}

export interface StaffCourseProgressChartResponse extends CourseProgressChartPeriodMetadata {
  student_offset: number;
  student_limit: number;
  students_total: number;
  labels: string[];
  periods: CourseProgressPeriod[];
  datasets: CourseProgressChartDataset[];
  class_avg_series: (number | null)[];
  class_eligible_counts: number[];
}

export interface StudentCourseProgressChartResponse extends CourseProgressChartPeriodMetadata {
  periods: CourseProgressPeriod[];
  my_series: (number | null)[];
  class_avg_series: (number | null)[];
  my_grading_states: CourseChartGradingState[];
  my_graded_periods_count: number;
  my_eligible_periods_count: number;
  class_eligible_counts: number[];
  my_rank: number | null;
  class_size: number;
}

export type CourseProgressChartResponse = StaffCourseProgressChartResponse | StudentCourseProgressChartResponse;

export type StaffGradingState = "missing" | "unknown";
export type StaffGradingProvenance = "unknown";

export interface StaffProgressPeriod {
  id: number;
  period_label: string;
  period_start: string;
  period_end: string;
  class_avg_score?: number | null;
  class_avg_max_score?: number | null;
  class_avg_percentage?: number | null;
  graded_count?: number | null;
  has_graded_entries?: boolean;
}

export interface StaffProgressPeriodResult {
  period_id: number;
  grading_state: StaffGradingState;
  score: number | null;
  max_score: number | null;
  percentage: number | null;
}

export interface StaffProgressStudent {
  student_id: number;
  first_name: string;
  last_name: string;
  period_results: StaffProgressPeriodResult[];
  grading_provenance: StaffGradingProvenance;
}

export interface CourseStaffProgressResponse {
  course_id: number;
  periods: StaffProgressPeriod[];
  students: StaffProgressStudent[];
}


export interface CourseJournalMetricsResponse {
  class_avg_percentage: number;
  class_avg_score?: number;
  class_avg_max_score?: number;
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
  bonus_max_score?: number;
  student_count?: number;
  lesson_count?: number;
  cells_expected?: number;
  cells_filled?: number;
  avg_percentage?: number | null;
  avg_score?: number | null;
  state?: "upcoming" | "empty" | "partial" | "complete";
}

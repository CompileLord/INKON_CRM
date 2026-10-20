/**
 * Request/response models for /api/v1/users/* and the role-scoped list
 * endpoints (/api/v1/students/, /api/v1/mentors/), derived from
 * http://35.228.205.63:8001/api/v1/openapi.json.
 */
import type { Paginated } from "../pagination";
import type { CourseResponse } from "../courses/types";

export type Role = "superadmin" | "mentor" | "student" | "accountant";

export interface UserCreate {
  email: string;
  first_name: string;
  last_name: string;
  role: Role;
  date_of_birth?: string | null;
  phone?: string | null;
  parent_telegram_chat_id?: number | null;
  parent_phone?: string | null;
  payment_day_of_month?: number | null;
}

/**
 * The spec's UserUpdate has no `role` field at all — role is immutable after
 * creation via this API, it's not just optional. All other fields are
 * optional so PATCH can send only the changed keys.
 */
export type UserUpdate = Partial<Omit<UserCreate, "role">>;

export interface UserSelfUpdate {
  first_name?: string;
  last_name?: string;
  date_of_birth?: string | null;
  phone?: string | null;
  parent_telegram_chat_id?: number | null;
  parent_phone?: string | null;
}

export interface User {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  role: Role;
  date_of_birth: string | null;
  phone: string | null;
  parent_telegram_chat_id: number | null;
  parent_linked?: boolean;
  parent_link_code_expires_at?: string | null;
  parent_phone: string | null;
  photo_path: string | null;
  thumbnail_path: string | null;
  payment_day_of_month: number | null;
  raw_password?: string | null;
  must_set_password: boolean;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

export type PasswordSmsDestination = 'student_phone' | 'parent_phone';

export interface UserCreateResponse extends User {
  parent_link_code?: string | null;
  password_sms_destination?: PasswordSmsDestination | null;
}

export interface PasswordSmsResendResponse {
  destination: PasswordSmsDestination;
}

export type PasswordSmsDeliveryStatus = 'pending' | 'claimed' | 'delivered' | 'failed' | 'expired';

export interface PasswordSmsDelivery {
  id: number;
  user_id: number | null;
  status: PasswordSmsDeliveryStatus;
  masked_phone: string | null;
  attempt_count: number;
  max_attempts: number;
  last_error: string | null;
  provider_message_id: string | null;
  provider_status: string | null;
  created_at: string;
  delivered_at: string | null;
}

export interface TelegramLinkCode {
  code: string;
  expires_at: string;
}

export type PaginatedUsers<T = User> = Paginated<T>;

export interface ListUsersParams {
  search?: string;
  page?: number;
  page_size?: number;
}

export type StudentGradingState = "missing" | "unknown";
export type StudentGradingProvenance = "unknown";

export type StudentPerformanceTotalsScope = "all_recorded_student_period_summaries";
export type StudentPerformanceTotalsMeasuredPopulation = "all_recorded_student_period_summaries";
export type StudentPerformanceDenominatorBasis = "stored_period_total_lessons";

export type StudentCoursePerformanceScope = "single_course";
export type StudentCoursePerformanceMeasuredPopulation = "single_course_recorded_period_summaries";

export interface StudentPerformanceTotals {
  scope: StudentPerformanceTotalsScope;
  measured_population: StudentPerformanceTotalsMeasuredPopulation;
  denominator_basis: StudentPerformanceDenominatorBasis;
  grading_state: StudentGradingState;
  grading_provenance: StudentGradingProvenance;
  raw_avg_percentage: number | null;
  attendance_percentage: number | null;
  attendance_denominator: number;
  attended_lessons: number;
  absences: number;
  total_lessons: number;
  period_summaries_count: number;
  periods_with_max_score_count: number;
  total_score?: number;
  total_max_score?: number;
}

export interface StudentCoursePerformance {
  scope: StudentCoursePerformanceScope;
  measured_population: StudentCoursePerformanceMeasuredPopulation;
  denominator_basis: StudentPerformanceDenominatorBasis;
  grading_state: StudentGradingState;
  grading_provenance: StudentGradingProvenance;
  raw_avg_percentage: number | null;
  attendance_percentage: number | null;
  attendance_denominator: number;
  attended_lessons: number;
  absences: number;
  total_lessons: number;
  period_summaries_count: number;
  periods_with_max_score_count: number;
  total_score?: number;
  total_max_score?: number;
}

export interface StudentTotals {
  avg_percentage: number;
  total_score?: number;
  total_max_score?: number;
  attendance_percentage: number;
  absences: number;
  total_lessons: number;
  active_course_count: number;
  archived_course_count: number;
}

export interface StudentCourseProfile {
  course: CourseResponse;
  enrollment_status: "active" | "withdrawn" | "completed";
  bucket: "active" | "archive";
  my_avg_percentage: number;
  my_total_score?: number;
  my_total_max_score?: number;
  class_avg_score?: number;
  attendance_percentage: number;
  absences: number;
  periods_total: number;
  periods_graded: number;
  my_rank: number;
  class_size: number;
  class_avg_percentage: number;
  next_lesson_at: string | null;
  performance?: StudentCoursePerformance | null;
}

export interface StudentProfileResponse {
  user: User;
  totals: StudentTotals;
  courses: StudentCourseProfile[];
  avg_score: number;
  absences: number;
  total_lessons: number;
  performance?: StudentPerformanceTotals | null;
}

export interface StudentJournalPeriod {
  journal_id: number;
  course_id: number;
  course_title: string;
  period_label: string;
  period_start: string;
  period_end: string;
  homework_score?: number;
  attendance_score?: number;
  exam_score?: number;
  bonus_score?: number;
  sum_score: number;
  max_period_score: number;
  percentage: number;
  attendance_count: number;
  total_lessons: number;
  state: "graded" | "in_progress" | "upcoming";
}

export interface MentorProfileResponse {
  user: User;
  active_courses: CourseResponse[];
  active_students_count: number;
  avg_score: number;
  active_students_population: "active_enrollments_on_assigned_courses_including_soft_deleted_courses";
  avg_score_grading_state: "missing" | "unknown";
  avg_score_provenance: "unknown";
  avg_score_basis: "all_summaries_on_courses_currently_assigned_including_soft_deleted_and_archived";
  avg_score_summary_count: number;
  avg_score_defined_ratio_count: number;
  avg_score_undefined_ratio_count: number;
  avg_score_defined_ratios_mean: number | null;
}

export interface MentorAnalyticsResponse {
  active_courses_count: number;
  active_courses_population: "active_non_deleted_courses";
  total_students_count: number;
  total_students_population: "non_deleted_enrollments_on_assigned_courses_all_statuses_including_soft_deleted_courses";
  average_student_score: number;
  average_student_score_grading_state: "missing" | "unknown";
  average_student_score_provenance: "unknown";
  average_student_score_basis: "all_summaries_on_non_deleted_courses_including_archived_raw_points";
  average_student_score_summary_count: number;
}

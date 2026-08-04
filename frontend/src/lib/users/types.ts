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

export type PaginatedUsers<T = User> = Paginated<T>;

export interface ListUsersParams {
  search?: string;
  page?: number;
  page_size?: number;
}

export interface StudentTotals {
  avg_percentage: number;
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
  attendance_percentage: number;
  absences: number;
  periods_total: number;
  periods_graded: number;
  my_rank: number;
  class_size: number;
  class_avg_percentage: number;
  next_lesson_at: string | null;
}

export interface StudentProfileResponse {
  user: User;
  totals: StudentTotals;
  courses: StudentCourseProfile[];
  avg_score: number;
  absences: number;
  total_lessons: number;
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
}

export interface MentorAnalyticsResponse {
  active_courses_count: number;
  total_students_count: number;
  average_student_score: number;
}

/**
 * Request/response models for /api/v1/enrollments/*, derived from
 * http://35.228.205.63:8001/api/v1/openapi.json.
 *
 * The spec's GET /enrollments/ only documents `page`/`page_size` — no
 * `student_id`/`course_id` filter. We send them anyway (FastAPI sometimes
 * under-documents accepted query params); `hooks.ts` detects whether the
 * server actually honored the filter and falls back to fetching every page
 * and filtering client-side when it didn't. See `fetchFilteredEnrollments`.
 */
import type { Paginated } from "../pagination";

export type EnrollmentStatus = "active" | "withdrawn" | "completed";

export interface EnrollmentCreate {
  student_id: number;
  course_id: number;
}

export interface EnrollmentResponse {
  id: number;
  student_id: number;
  course_id: number;
  price_at_enrollment: string;
  color_hex: string;
  enrolled_at: string; // date-time
  status: EnrollmentStatus;
  is_deleted: boolean;
}

export interface ListEnrollmentsParams {
  page?: number;
  page_size?: number;
  /** Undocumented in the spec — sent optimistically, see module doc comment. */
  student_id?: number;
  /** Undocumented in the spec — sent optimistically, see module doc comment. */
  course_id?: number;
}

export type PaginatedEnrollments = Paginated<EnrollmentResponse>;

export interface RosterStudentIdentity {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string | null;
  photo_path?: string | null;
  thumbnail_path?: string | null;
}

export interface CourseRosterItem {
  id: number;
  enrollment_id: number;
  student_id: number;
  course_id: number;
  price_at_enrollment: string;
  color_hex: string;
  enrolled_at: string;
  status: EnrollmentStatus;
  student: RosterStudentIdentity;
}

export interface CourseRosterResponse {
  items: CourseRosterItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  active_count: number;
  located_page?: number | null;
  located_index?: number | null;
}

export interface RosterLocationResponse {
  student_id: number;
  enrollment_id: number;
  page: number;
  index: number;
  total: number;
  item: CourseRosterItem;
}

export interface EligibleCandidateResponse {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string | null;
  photo_path?: string | null;
  thumbnail_path?: string | null;
}

export interface CourseRosterParams {
  page?: number;
  page_size?: number;
  search?: string;
  status?: EnrollmentStatus;
  sort?: "name_asc" | "name_desc" | "enrolled_asc" | "enrolled_desc" | "price_asc" | "price_desc";
  student_id?: number;
  locate_student_id?: number;
}

export interface EligibleCandidatesParams {
  page?: number;
  page_size?: number;
  search?: string;
}

export type PaginatedEligibleCandidates = Paginated<EligibleCandidateResponse>;
export type PaginatedCourseRoster = CourseRosterResponse;

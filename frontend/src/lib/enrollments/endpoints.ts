import { httpClient } from "../auth/httpClient";
import type {
  CourseRosterParams,
  CourseRosterResponse,
  EligibleCandidatesParams,
  EnrollmentCreate,
  EnrollmentResponse,
  ListEnrollmentsParams,
  PaginatedEligibleCandidates,
  PaginatedEnrollments,
  RosterLocationResponse,
  WithdrawalPreviewResponse,
} from "./types";

export function createEnrollment(payload: EnrollmentCreate): Promise<EnrollmentResponse> {
  return httpClient.post<EnrollmentResponse>("/enrollments/", payload).then((res) => res.data);
}

export function listEnrollments(params: ListEnrollmentsParams = {}): Promise<PaginatedEnrollments> {
  return httpClient.get<PaginatedEnrollments>("/enrollments/", { params }).then((res) => res.data);
}

export function withdrawEnrollment(id: number): Promise<EnrollmentResponse> {
  return httpClient.patch<EnrollmentResponse>(`/enrollments/${id}/withdraw`).then((res) => res.data);
}

export function getWithdrawalPreview(id: number): Promise<WithdrawalPreviewResponse> {
  return httpClient.get<WithdrawalPreviewResponse>(`/enrollments/${id}/withdraw-preview`).then((res) => res.data);
}

export function getCourseRoster(courseId: number, params: CourseRosterParams = {}): Promise<CourseRosterResponse> {
  return httpClient
    .get<CourseRosterResponse>(`/enrollments/courses/${courseId}/roster`, { params })
    .then((res) => res.data);
}

export function locateRosterStudent(
  courseId: number,
  studentId: number,
  params: Omit<CourseRosterParams, "student_id" | "locate_student_id"> = {}
): Promise<RosterLocationResponse> {
  return httpClient
    .get<RosterLocationResponse>(`/enrollments/courses/${courseId}/roster/locate`, {
      params: { student_id: studentId, ...params },
    })
    .then((res) => res.data);
}

export function getEligibleCandidates(
  courseId: number,
  params: EligibleCandidatesParams = {}
): Promise<PaginatedEligibleCandidates> {
  return httpClient
    .get<PaginatedEligibleCandidates>(`/enrollments/courses/${courseId}/eligible-candidates`, { params })
    .then((res) => res.data);
}

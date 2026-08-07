import { httpClient } from "../auth/httpClient";
import type { EnrollmentCreate, EnrollmentResponse, ListEnrollmentsParams, PaginatedEnrollments } from "./types";

export function createEnrollment(payload: EnrollmentCreate): Promise<EnrollmentResponse> {
  return httpClient.post<EnrollmentResponse>("/enrollments/", payload).then((res) => res.data);
}

export function listEnrollments(params: ListEnrollmentsParams = {}): Promise<PaginatedEnrollments> {
  return httpClient.get<PaginatedEnrollments>("/enrollments/", { params }).then((res) => res.data);
}

export function withdrawEnrollment(id: number): Promise<EnrollmentResponse> {
  return httpClient.patch<EnrollmentResponse>(`/enrollments/${id}/withdraw`).then((res) => res.data);
}

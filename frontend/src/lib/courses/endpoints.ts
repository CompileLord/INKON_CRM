import { httpClient } from "../auth/httpClient";
import type {
  CourseCreate,
  CourseJournalMetricsResponse,
  CourseMentorHistoryResponse,
  CourseProgressChartResponse,
  CourseResponse,
  CourseScheduleResponse,
  CourseUpdate,
  JournalPeriod,
  ListCoursesParams,
  PaginatedCourses,
} from "./types";

export function createCourse(payload: CourseCreate): Promise<CourseResponse> {
  return httpClient.post<CourseResponse>("/courses/", payload).then((res) => res.data);
}

export function listCourses(params: ListCoursesParams = {}): Promise<PaginatedCourses> {
  return httpClient.get<PaginatedCourses>("/courses/", { params }).then((res) => res.data);
}

export function getCourse(id: number): Promise<CourseResponse> {
  return httpClient.get<CourseResponse>(`/courses/${id}`).then((res) => res.data);
}

export function updateCourse(id: number, payload: CourseUpdate): Promise<CourseResponse> {
  return httpClient.patch<CourseResponse>(`/courses/${id}`, payload).then((res) => res.data);
}

export function uploadCourseImage(id: number, file: File): Promise<CourseResponse> {
  const formData = new FormData();
  formData.append("file", file);
  return httpClient
    .post<CourseResponse>(`/courses/${id}/image/`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    })
    .then((res) => res.data);
}

export function deleteCourse(id: number): Promise<void> {
  return httpClient.delete<void>(`/courses/${id}`).then(() => undefined);
}

export function getCourseSchedule(id: number): Promise<CourseScheduleResponse[]> {
  return httpClient
    .get<CourseScheduleResponse[]>(`/courses/${id}/schedule`)
    .then((res) => res.data);
}

export function copyCourse(id: number, payload: CourseCreate): Promise<CourseResponse> {
  return httpClient.post<CourseResponse>(`/courses/${id}/copy/`, payload).then((res) => res.data);
}

export function getCourseMentorHistory(id: number): Promise<CourseMentorHistoryResponse[]> {
  return httpClient
    .get<CourseMentorHistoryResponse[]>(`/courses/${id}/mentor-history`)
    .then((res) => res.data);
}

export function getCourseProgressChart(id: number): Promise<CourseProgressChartResponse> {
  return httpClient
    .get<CourseProgressChartResponse>(`/courses/${id}/progress-chart`)
    .then((res) => res.data);
}

/** Ordered list of the weekly/monthly periods (`Journal`s) a course has been split into. */
export function getCourseJournals(id: number): Promise<JournalPeriod[]> {
  return httpClient.get<JournalPeriod[]>(`/courses/${id}/journals`).then((res) => res.data);
}

export function getCourseJournalMetrics(id: number): Promise<CourseJournalMetricsResponse> {
  return httpClient.get<CourseJournalMetricsResponse>(`/courses/${id}/journal-metrics`).then((res) => res.data);
}

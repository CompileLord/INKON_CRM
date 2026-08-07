import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  copyCourse,
  createCourse,
  deleteCourse,
  getCourse,
  getCourseJournals,
  getCourseJournalMetrics,
  getCourseMentorHistory,
  getCourseProgressChart,
  getCourseSchedule,
  listCourses,
  updateCourse,
  uploadCourseImage,
} from "./endpoints";
import type { CourseCreate, CourseUpdate, ListCoursesParams } from "./types";

function listQueryKey(params: ListCoursesParams) {
  return ["courses", "list", params] as const;
}

export function useCourses(params: ListCoursesParams = {}) {
  return useQuery({
    queryKey: listQueryKey(params),
    queryFn: () => listCourses(params),
    placeholderData: keepPreviousData,
  });
}

export function useCourse(id: number | undefined) {
  return useQuery({
    queryKey: ["courses", "detail", id],
    queryFn: () => getCourse(id!),
    enabled: id !== undefined,
  });
}

export function useCourseSchedule(id: number | undefined) {
  return useQuery({
    queryKey: ["courses", "schedule", id],
    queryFn: () => getCourseSchedule(id!),
    enabled: id !== undefined,
  });
}

export function useCourseMentorHistory(id: number | undefined, enabled = true) {
  return useQuery({
    queryKey: ["courses", "mentor-history", id],
    queryFn: () => getCourseMentorHistory(id!),
    enabled: id !== undefined && enabled,
  });
}

export function useCourseProgressChart(id: number | undefined) {
  return useQuery({
    queryKey: ["courses", "progress-chart", id],
    queryFn: () => getCourseProgressChart(id!),
    enabled: id !== undefined,
  });
}

/** Ordered list of a course's weekly/monthly periods — one per journal generated at course creation. */
export function useCourseJournals(id: number | undefined) {
  return useQuery({
    queryKey: ["courses", "journals", id],
    queryFn: () => getCourseJournals(id!),
    enabled: id !== undefined,
  });
}

export function useCreateCourse() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CourseCreate) => createCourse(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["courses", "list"] });
    },
  });
}

export function useUpdateCourse() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: CourseUpdate }) =>
      updateCourse(id, payload),
    onSuccess: (course) => {
      queryClient.invalidateQueries({ queryKey: ["courses", "list"] });
      queryClient.invalidateQueries({ queryKey: ["courses", "detail", course.id] });
      queryClient.invalidateQueries({ queryKey: ["courses", "mentor-history", course.id] });
    },
  });
}

export function useUploadCourseImage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, file }: { id: number; file: File }) => uploadCourseImage(id, file),
    onSuccess: (course) => {
      queryClient.invalidateQueries({ queryKey: ["courses", "list"] });
      queryClient.invalidateQueries({ queryKey: ["courses", "detail", course.id] });
    },
  });
}

export function useDeleteCourse() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => deleteCourse(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["courses", "list"] });
    },
  });
}

export function useCopyCourse() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: CourseCreate }) => copyCourse(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["courses", "list"] });
    },
  });
}

export function useCourseJournalMetrics(courseId: number | undefined) {
  return useQuery({
    queryKey: ["courses", "journal-metrics", courseId],
    queryFn: () => getCourseJournalMetrics(courseId!),
    enabled: courseId !== undefined,
  });
}

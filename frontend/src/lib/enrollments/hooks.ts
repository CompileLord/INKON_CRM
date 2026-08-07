import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { getStudentProfile } from "../users/endpoints";
import type { StudentProfileResponse, User } from "../users/types";
import { createEnrollment, listEnrollments, withdrawEnrollment } from "./endpoints";
import type { EnrollmentCreate, EnrollmentResponse } from "./types";

const PAGE_SIZE = 100;

interface EnrollmentFilter {
  student_id?: number;
  course_id?: number;
}

function matchesFilter(enrollment: EnrollmentResponse, filter: EnrollmentFilter): boolean {
  if (filter.student_id !== undefined && enrollment.student_id !== filter.student_id) return false;
  if (filter.course_id !== undefined && enrollment.course_id !== filter.course_id) return false;
  return true;
}

async function fetchAllPages(params: EnrollmentFilter): Promise<EnrollmentResponse[]> {
  const first = await listEnrollments({ ...params, page: 1, page_size: PAGE_SIZE });
  const items = [...first.items];
  for (let page = 2; page <= first.total_pages; page++) {
    const next = await listEnrollments({ ...params, page, page_size: PAGE_SIZE });
    items.push(...next.items);
  }
  return items;
}

/**
 * GET /enrollments/ doesn't document a student_id/course_id filter. We send
 * it anyway; if the server honors it, every returned item already matches
 * and we're done cheaply. If it doesn't (returned items include other
 * students/courses), we fall back to paging through the unfiltered list and
 * filtering client-side.
 */
export async function fetchFilteredEnrollments(filter: EnrollmentFilter): Promise<EnrollmentResponse[]> {
  const first = await listEnrollments({ ...filter, page: 1, page_size: PAGE_SIZE });
  const serverHonoredFilter = first.items.every((item) => matchesFilter(item, filter));

  if (serverHonoredFilter) {
    const items = [...first.items];
    for (let page = 2; page <= first.total_pages; page++) {
      const next = await listEnrollments({ ...filter, page, page_size: PAGE_SIZE });
      items.push(...next.items);
    }
    return items;
  }

  const all = await fetchAllPages({});
  return all.filter((item) => matchesFilter(item, filter));
}

/** Cheap way to read a system-wide enrollment count for stat cards, without pulling every row. */
export function useEnrollmentsTotal(enabled: boolean = true) {
  return useQuery({
    queryKey: ["enrollments", "total"],
    queryFn: () => listEnrollments({ page: 1, page_size: 1 }).then((res) => res.total),
    enabled,
  });
}

export function useCourseEnrollments(courseId: number | undefined) {
  return useQuery({
    queryKey: ["enrollments", "by-course", courseId],
    queryFn: () => fetchFilteredEnrollments({ course_id: courseId! }),
    enabled: courseId !== undefined,
  });
}

export function useStudentEnrollments(studentId: number | undefined) {
  return useQuery({
    queryKey: ["enrollments", "by-student", studentId],
    queryFn: () => fetchFilteredEnrollments({ student_id: studentId! }),
    enabled: studentId !== undefined,
  });
}

export interface CourseRosterRow {
  enrollment: EnrollmentResponse;
  student: User;
  avgScore: number;
}

export interface RosterBuildResult {
  rows: CourseRosterRow[];
  /** Enrollments whose student_id didn't resolve to a profile (e.g. the student was later deleted) — omitted from rows rather than failing the whole roster. */
  unresolvedCount: number;
}

/**
 * Pulled out of useCourseRoster so the "one bad row shouldn't break the
 * whole roster" behavior is testable without mounting a component. A
 * student_id can fail to resolve legitimately — e.g. an old enrollment for
 * a student who was later soft-deleted — so a missing profile is treated as
 * "omit this row," not "the roster failed to load."
 */
export function buildRoster(
  enrollments: EnrollmentResponse[],
  profiles: (StudentProfileResponse | undefined)[],
): RosterBuildResult {
  let unresolvedCount = 0;

  const rows: CourseRosterRow[] = enrollments.flatMap((enrollment, i) => {
    const profile = profiles[i];
    if (!profile) {
      unresolvedCount += 1;
      return [];
    }
    return [{ enrollment, student: profile.user, avgScore: profile.avg_score }];
  });

  return { rows, unresolvedCount };
}

/**
 * Course profile roster: joins each enrollment with the enrolled student's
 * identity. There's no GET /students/{id} (bare) — /students/{id}/profile is
 * the only way to resolve a student_id to a name, and it shares the exact
 * query key useStudentProfile uses, so results are cached once either page
 * has loaded them.
 *
 * isError reflects only the enrollments list failing to load — an
 * individual student's profile 404ing (e.g. a since-deleted student with a
 * historical enrollment) must not take down the entire roster; see
 * buildRoster.
 */
export function useCourseRoster(courseId: number | undefined) {
  const enrollments = useCourseEnrollments(courseId);
  const studentIds = enrollments.data?.map((e) => e.student_id) ?? [];

  const profileQueries = useQueries({
    queries: studentIds.map((id) => ({
      queryKey: ["users", "students", "profile", id],
      queryFn: () => getStudentProfile(id),
    })),
  });

  const isLoading = enrollments.isLoading || profileQueries.some((q) => q.isLoading);
  const isError = enrollments.isError;

  const { rows, unresolvedCount } = buildRoster(
    enrollments.data ?? [],
    profileQueries.map((q) => q.data),
  );

  return { rows, unresolvedCount, isLoading, isError, refetch: enrollments.refetch };
}

export function useEnrollStudent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: EnrollmentCreate) => createEnrollment(payload),
    onSuccess: (enrollment) => {
      queryClient.invalidateQueries({ queryKey: ["enrollments", "by-course", enrollment.course_id] });
      queryClient.invalidateQueries({ queryKey: ["enrollments", "by-student", enrollment.student_id] });
      queryClient.invalidateQueries({
        queryKey: ["users", "students", "profile", enrollment.student_id],
      });
    },
  });
}

interface WithdrawInput {
  id: number;
  studentId: number;
  courseId: number;
}

export function useWithdrawEnrollment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id }: WithdrawInput) => withdrawEnrollment(id),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: ["enrollments", "by-course", variables.courseId] });
      queryClient.invalidateQueries({ queryKey: ["enrollments", "by-student", variables.studentId] });
      queryClient.invalidateQueries({
        queryKey: ["users", "students", "profile", variables.studentId],
      });
    },
  });
}

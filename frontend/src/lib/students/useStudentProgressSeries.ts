import { useQueries, useQuery } from "@tanstack/react-query";
import { getCourseStaffProgress } from "../courses/endpoints";
import { getMyStudentJournals } from "../users/endpoints";
import {
  StudentProgressSeriesBuilder,
  type StudentProgressCourseReference,
  type StudentProgressSeries,
} from "./StudentProgressSeriesBuilder";

export interface StudentProgressSeriesState {
  series: StudentProgressSeries[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

export function useStudentProgressSeries(
  studentId: number | undefined,
  courses: StudentProgressCourseReference[],
  readsOwnJournals: boolean,
): StudentProgressSeriesState {
  const ownJournals = useQuery({
    queryKey: ["users", "students", "journals", "me", undefined],
    queryFn: () => getMyStudentJournals(),
    enabled: readsOwnJournals && studentId !== undefined,
  });

  const staffProgress = useQueries({
    queries: courses.map((course) => ({
      queryKey: ["courses", "staff-progress", course.id],
      queryFn: () => getCourseStaffProgress(course.id),
      enabled: !readsOwnJournals && studentId !== undefined,
      retry: false,
    })),
  });

  if (readsOwnJournals) {
    const series: StudentProgressSeries[] = ownJournals.data
      ? courses.map((course, slot) => StudentProgressSeriesBuilder.fromOwnJournals(course, slot, ownJournals.data))
      : [];
    return {
      series,
      isLoading: ownJournals.isLoading,
      isError: ownJournals.isError,
      refetch: () => void ownJournals.refetch(),
    };
  }

  const series: StudentProgressSeries[] = courses.flatMap((course, slot) => {
    const progress = staffProgress[slot]?.data;
    return progress && studentId !== undefined
      ? [StudentProgressSeriesBuilder.fromStaffProgress(course, slot, progress, studentId)]
      : [];
  });
  const everyRequestFailed: boolean = staffProgress.length > 0 && staffProgress.every((query) => query.isError);
  return {
    series,
    isLoading: staffProgress.some((query) => query.isLoading),
    isError: everyRequestFailed,
    refetch: () => staffProgress.forEach((query) => void query.refetch()),
  };
}

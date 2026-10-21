import { useQueries } from "@tanstack/react-query";
import { getCourseStaffProgress } from "../courses/endpoints";
import { useMyStudentJournalHistory } from "../users/hooks";
import type { StudentJournalPeriod } from "../users/types";
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
  history?: { items: StudentJournalPeriod[]; hasMore: boolean; loadingMore: boolean; loadMore: () => void; hasUpcoming: boolean };
}

export function useStudentProgressSeries(
  studentId: number | undefined,
  courses: StudentProgressCourseReference[],
  readsOwnJournals: boolean,
): StudentProgressSeriesState {
  const ownJournals: ReturnType<typeof useMyStudentJournalHistory> = useMyStudentJournalHistory(undefined, readsOwnJournals && studentId !== undefined);

  const staffProgress = useQueries({
    queries: courses.map((course) => ({
      queryKey: ["courses", "staff-progress", course.id],
      queryFn: () => getCourseStaffProgress(course.id),
      enabled: !readsOwnJournals && studentId !== undefined,
      retry: false,
    })),
  });

  if (readsOwnJournals) {
    const items: StudentJournalPeriod[] = ownJournals.data?.pages.flatMap((page) => page.items) ?? [];
    const series: StudentProgressSeries[] = ownJournals.data
      ? courses.map((course, slot) => StudentProgressSeriesBuilder.fromOwnJournals(course, slot, items))
      : [];
    return {
      series,
      isLoading: ownJournals.isLoading,
      isError: ownJournals.isError,
      refetch: () => void ownJournals.refetch(),
      history: { items, hasMore: ownJournals.hasNextPage, loadingMore: ownJournals.isFetchingNextPage, loadMore: () => void ownJournals.fetchNextPage(), hasUpcoming: ownJournals.data?.pages[0]?.has_upcoming_periods ?? false },
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

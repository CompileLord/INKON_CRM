import { CourseRosterSection, type CourseRosterSortOption } from "./CourseRosterSection";
import type { RosterStatusFilter } from "../../lib/enrollments/types";

interface CourseStudentsPaneProps {
  courseId: number;
  courseTitle: string;
  coursePrice: string;
  isSuperAdmin: boolean;
  isMentor: boolean;
  searchQuery: string;
  onSearchQueryChange: (q: string) => void;
  sortOption: CourseRosterSortOption;
  onSortOptionChange: (s: CourseRosterSortOption) => void;
  page: number;
  onPageChange: (p: number) => void;
  statusFilter: RosterStatusFilter;
  onStatusFilterChange: (s: RosterStatusFilter) => void;
  onToast: (message: string, variant: "success" | "error") => void;
  onReady?: () => void;
}

export function CourseStudentsPane({
  courseId,
  courseTitle,
  coursePrice,
  isSuperAdmin,
  isMentor,
  searchQuery,
  onSearchQueryChange,
  sortOption,
  onSortOptionChange,
  page,
  onPageChange,
  statusFilter,
  onStatusFilterChange,
  onToast,
  onReady,
}: CourseStudentsPaneProps) {
  return (
    <CourseRosterSection
      courseId={courseId}
      courseTitle={courseTitle}
      coursePrice={coursePrice}
      isSuperAdmin={isSuperAdmin}
      isMentor={isMentor}
      searchQuery={searchQuery}
      onSearchQueryChange={onSearchQueryChange}
      sortOption={sortOption}
      onSortOptionChange={onSortOptionChange}
      page={page}
      onPageChange={onPageChange}
      statusFilter={statusFilter}
      onStatusFilterChange={onStatusFilterChange}
      onToast={onToast}
      onReady={onReady}
    />
  );
}

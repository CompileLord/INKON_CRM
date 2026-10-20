import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { DataTable, type DataTableColumn } from "../ui/DataTable";
import { ListRow } from "../ui/ListRow";
import { PersonAvatar } from "../ui/PersonAvatar";
import { usePeriodName } from "../ui/periodName";
import { ScoreFigure } from "../profile/ScoreFigure";
import type { StaffProgressPeriod, StaffProgressPeriodResult, StaffProgressStudent } from "../../lib/courses/types";

interface CourseProgressTableProps {
  periods: StaffProgressPeriod[];
  students: StaffProgressStudent[];
  activePeriodId: number | undefined;
  onStudentOpen: () => void;
}

class PeriodResultLookup {
  static find(student: StaffProgressStudent, periodId: number | undefined): StaffProgressPeriodResult | undefined {
    return student.period_results.find((result: StaffProgressPeriodResult) => result.period_id === periodId);
  }

  static scoreOf(result: StaffProgressPeriodResult | undefined): { score: number | null; max: number | null } {
    if (!result || result.grading_state === "missing") return { score: null, max: null };
    return { score: result.score, max: result.max_score };
  }
}

export function CourseProgressTable({ periods, students, activePeriodId, onStudentOpen }: CourseProgressTableProps) {
  const { t } = useTranslation("courseDetail");
  const periodName = usePeriodName();

  const studentColumn: DataTableColumn<StaffProgressStudent> = {
    key: "student",
    header: t("progress.student"),
    cell: (student: StaffProgressStudent) => (
      <span className="flex min-w-0 items-center gap-3">
        <PersonAvatar firstName={student.first_name} lastName={student.last_name} size={28} />
        <Link
          to={`/students/${student.student_id}`}
          onClick={onStudentOpen}
          className="min-w-0 break-words text-sm font-medium text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring after:absolute after:inset-0 after:content-['']"
        >
          {student.first_name} {student.last_name}
        </Link>
      </span>
    ),
  };

  const periodColumns: DataTableColumn<StaffProgressStudent>[] = periods.map((period: StaffProgressPeriod) => ({
    key: `period-${period.id}`,
    header: periodName(period.period_label),
    numeric: true,
    cell: (student: StaffProgressStudent) => {
      const { score, max } = PeriodResultLookup.scoreOf(PeriodResultLookup.find(student, period.id));
      return <ScoreFigure score={score} max={max} />;
    },
  }));

  return (
    <>
      <div className="hidden md:block">
        <DataTable
          caption={t("progress.tableLabel")}
          columns={[studentColumn, ...periodColumns]}
          rows={students}
          rowKey={(student: StaffProgressStudent) => String(student.student_id)}
          isLoading={false}
          isError={false}
          onRetry={() => undefined}
          emptyTitle={t("progress.emptyStudents")}
        />
      </div>
      <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-card p-1 md:hidden">
        {students.map((student: StaffProgressStudent) => {
          const { score, max } = PeriodResultLookup.scoreOf(PeriodResultLookup.find(student, activePeriodId));
          return (
            <li key={student.student_id}>
              <ListRow to={`/students/${student.student_id}`}>
                <span className="flex min-w-0 items-center justify-between gap-3" onClick={onStudentOpen}>
                  <span className="flex min-w-0 items-center gap-3">
                    <PersonAvatar firstName={student.first_name} lastName={student.last_name} size={36} />
                    <span className="min-w-0 break-words text-sm font-medium text-ink">{student.first_name} {student.last_name}</span>
                  </span>
                  <ScoreFigure score={score} max={max} className="shrink-0 text-right text-sm" />
                </span>
              </ListRow>
            </li>
          );
        })}
      </ul>
    </>
  );
}

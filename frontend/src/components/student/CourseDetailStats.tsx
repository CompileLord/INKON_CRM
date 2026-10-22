import { useTranslation } from "react-i18next";
import type { StudentCourseProfile, StudentCoursePerformance } from "../../lib/users/types";
import { formatNumber } from "../../i18n/formatters";
import { WholePercent } from "../../lib/students/WholePercent";
import { StatGroup, StatTile } from "../ui/StatGroup";
import { CourseScore } from "./CourseScore";

interface CourseDetailStatsProps {
  entry: StudentCourseProfile | undefined;
}

export function CourseDetailStats({ entry }: CourseDetailStatsProps) {
  const { t } = useTranslation("student");
  const hasScore: boolean = entry !== undefined && entry.my_total_score !== undefined && entry.my_total_max_score !== undefined && entry.my_total_max_score > 0;
  const performance: StudentCoursePerformance | null | undefined = entry?.performance;
  const hasLessons: boolean = performance != null && performance.attendance_denominator > 0;

  if (entry === undefined) return null;

  return (
    <div data-testid="course-stats">
      <StatGroup compact>
        <StatTile label={t("myAverage")} value={hasScore ? <CourseScore score={entry.my_total_score!} /> : t("notGradedYet")} />
        {hasLessons ? <StatTile label={t("attendance")} value={WholePercent.format((performance!.attended_lessons * 100) / performance!.attendance_denominator)} /> : null}
        {hasLessons ? <StatTile label={t("absences")} value={formatNumber(performance!.absences)} hint={t("ofLessons", { total: formatNumber(performance!.total_lessons) })} /> : null}
      </StatGroup>
    </div>
  );
}

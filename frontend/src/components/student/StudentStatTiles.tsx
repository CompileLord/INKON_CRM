import { useTranslation } from "react-i18next";
import { StatGroup, StatTile } from "../ui/StatGroup";
import { ScoreFormat } from "../profile/ScoreFormat";
import { formatNumber } from "../../i18n/formatters";
import { ActiveCourseScores } from "./ActiveCourseScores";
import type { StudentCourseProfile, StudentPerformanceTotals } from "../../lib/users/types";

interface StudentStatTilesProps {
  courses: StudentCourseProfile[];
  performance: StudentPerformanceTotals | null | undefined;
}

export function StudentStatTiles({ courses, performance }: StudentStatTilesProps) {
  const { t, i18n } = useTranslation("studentProfile");
  const totals: { score: number; max: number } | null = ActiveCourseScores.totals(courses);
  const hasAttendance: boolean = performance !== null && performance !== undefined && performance.attendance_denominator > 0 && performance.attendance_percentage !== null;
  const attendanceValue: string | null = hasAttendance && performance?.attendance_percentage != null
    ? `${formatNumber(performance.attendance_percentage, i18n.language, { maximumFractionDigits: 0 })}%`
    : null;
  const absencesHint: string | undefined = performance && performance.attendance_denominator > 0
    ? t("stats.absencesOf", { absences: formatNumber(performance.absences, i18n.language), total: formatNumber(performance.total_lessons, i18n.language) })
    : undefined;

  const scoreValue: string | null = totals ? ScoreFormat.points(totals.score, i18n.language) : null;
  if (scoreValue === null && attendanceValue === null) return null;

  return (
    <div data-profile-summary>
      <StatGroup compact>
        {scoreValue !== null ? <StatTile label={t("stats.score")} value={scoreValue} /> : null}
        {attendanceValue !== null ? <StatTile label={t("stats.attendance")} value={attendanceValue} hint={absencesHint} /> : null}
      </StatGroup>
    </div>
  );
}

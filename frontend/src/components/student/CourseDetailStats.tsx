import { useTranslation } from "react-i18next";
import type { StudentCourseProfile } from "../../lib/users/types";
import type { CourseResultSummary } from "../../lib/students/CourseResultSummary";
import { formatNumber } from "../../i18n/formatters";
import { WholePercent } from "../../lib/students/WholePercent";
import { StatGroup, StatTile } from "../ui/StatGroup";
import { ScoreFraction } from "./ScoreFraction";

interface CourseDetailStatsProps {
  entry: StudentCourseProfile | undefined;
  results: CourseResultSummary | null;
}

export function CourseDetailStats({ entry, results }: CourseDetailStatsProps) {
  const { t } = useTranslation("student");
  const hasScore: boolean = entry !== undefined && entry.my_total_score !== undefined && entry.my_total_max_score !== undefined && entry.my_total_max_score > 0;
  const hasLessons: boolean = results !== null && results.totalLessons > 0;

  return (
    <div data-testid="course-stats">
      <StatGroup>
        <StatTile
          label={t("myAverage")}
          value={hasScore ? <ScoreFraction score={entry!.my_total_score!} maximum={entry!.my_total_max_score!} showPercentage /> : results !== null ? t("notGradedYet") : null}
        />
        <StatTile label={t("attendance")} value={hasLessons ? WholePercent.format((results!.attendedLessons * 100) / results!.totalLessons) : null} />
        <StatTile
          label={t("absences")}
          value={hasLessons ? formatNumber(results!.totalLessons - results!.attendedLessons) : null}
          hint={hasLessons ? t("ofLessons", { total: formatNumber(results!.totalLessons) }) : undefined}
        />
      </StatGroup>
    </div>
  );
}

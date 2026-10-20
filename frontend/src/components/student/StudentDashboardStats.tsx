import { useTranslation } from "react-i18next";
import type { StudentTotals } from "../../lib/users/types";
import { formatNumber, formatPercentage } from "../../i18n/formatters";
import { StatGroup, StatTile } from "../ui/StatGroup";
import { ScoreFraction } from "./ScoreFraction";

interface StudentDashboardStatsProps {
  totals: StudentTotals | undefined;
}

export function StudentDashboardStats({ totals }: StudentDashboardStatsProps) {
  const { t } = useTranslation("student");
  const hasScore: boolean = totals !== undefined && totals.total_score !== undefined && totals.total_max_score !== undefined && totals.total_max_score > 0;
  const hasLessons: boolean = totals !== undefined && totals.total_lessons > 0;

  return (
    <StatGroup>
      <StatTile
        label={t("average")}
        value={hasScore ? <ScoreFraction score={totals!.total_score!} maximum={totals!.total_max_score!} showPercentage /> : null}
      />
      <StatTile label={t("attendance")} value={hasLessons ? formatPercentage(totals!.attendance_percentage) : null} />
      <StatTile
        label={t("absences")}
        value={totals ? formatNumber(totals.absences) : null}
        hint={hasLessons ? t("ofLessons", { total: formatNumber(totals!.total_lessons) }) : undefined}
      />
    </StatGroup>
  );
}

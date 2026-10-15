import type { ReactNode } from "react";
import { CalendarX2, Gauge, UserCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { InfoTooltip } from "../ui/InfoTooltip";
import { formatNumber } from "../../i18n/formatters";
import type { StudentPerformanceTotals } from "../../lib/users/types";

interface StudentStatTilesProps {
  performance: StudentPerformanceTotals | null | undefined;
}

interface StatTileProps {
  icon: ReactNode;
  label: string;
  info?: ReactNode;
  children: ReactNode;
}

function StatTile({ icon, label, info, children }: StatTileProps) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-xl bg-strip p-2.5 sm:p-3">
      <div className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-muted">
        <span aria-hidden="true" className="hidden shrink-0 sm:inline-flex">{icon}</span>
        <span className="truncate">{label}</span>
        {info}
      </div>
      <p className="text-xl font-semibold leading-7 text-ink tabular-nums [overflow-wrap:anywhere] sm:text-2xl">{children}</p>
    </div>
  );
}

export function StudentStatTiles({ performance }: StudentStatTilesProps) {
  const { t, i18n } = useTranslation("students");
  const storedScore: number | null | undefined = performance?.raw_avg_percentage;
  const hasAttendanceBasis: boolean = performance !== null && performance !== undefined && performance.attendance_denominator > 0;
  const attendancePercentage: number | null | undefined = hasAttendanceBasis ? performance?.attendance_percentage : null;

  return (
    <div data-profile-summary className="grid grid-cols-3 gap-2">
      <StatTile
        icon={<Gauge size={14} />}
        label={t("stats.average")}
        info={<InfoTooltip label={t("stats.average")}>{t("stats.averageInfo")}</InfoTooltip>}
      >
        {storedScore === null || storedScore === undefined ? (
          <>
            <span aria-hidden="true">{t("missingScoreValue")}</span>
            <span className="sr-only">{t("scoreUnavailable")}</span>
          </>
        ) : (
          formatNumber(storedScore, i18n.language, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
        )}
      </StatTile>
      <StatTile icon={<UserCheck size={14} />} label={t("stats.attendance")}>
        {attendancePercentage === null || attendancePercentage === undefined ? (
          <>
            <span aria-hidden="true">{t("missingScoreValue")}</span>
            <span className="sr-only">{t("attendanceUnavailable")}</span>
          </>
        ) : (
          `${formatNumber(attendancePercentage, i18n.language, { maximumFractionDigits: 0 })}%`
        )}
      </StatTile>
      <StatTile icon={<CalendarX2 size={14} />} label={t("stats.absences")}>
        {performance ? (
          t("stats.absencesOf", {
            absences: formatNumber(performance.absences, i18n.language),
            total: formatNumber(performance.total_lessons, i18n.language),
          })
        ) : (
          <>
            <span aria-hidden="true">{t("missingScoreValue")}</span>
            <span className="sr-only">{t("attendanceUnavailable")}</span>
          </>
        )}
      </StatTile>
    </div>
  );
}

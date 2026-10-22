import { useTranslation } from "react-i18next";
import { StatGroup, StatTile } from "../ui/StatGroup";
import { ScoreFormat } from "../profile/ScoreFormat";
import { formatNumber } from "../../i18n/formatters";
import { compareMoney, formatMoney } from "../../lib/money";
import { useStudentBalance } from "../../lib/finance/hooks";
import { ActiveCourseScores } from "./ActiveCourseScores";
import type { StudentCourseProfile, StudentPerformanceTotals } from "../../lib/users/types";

interface StudentStatTilesProps {
  studentId: number;
  courses: StudentCourseProfile[];
  performance: StudentPerformanceTotals | null | undefined;
  showBalance: boolean;
}

function BalanceTile({ studentId }: { studentId: number }) {
  const { t, i18n } = useTranslation("studentProfile");
  const { data: balance } = useStudentBalance(studentId);
  const suffix: string = t("stats.currency");
  const isDebt: boolean = balance !== undefined && compareMoney(balance.net_receivable, "0") > 0;
  const isCredit: boolean = balance !== undefined && !isDebt && compareMoney(balance.credit_balance, "0") > 0;
  const label: string = isDebt ? t("stats.debt") : isCredit ? t("stats.credit") : t("stats.balance");
  const amount: string | null = balance === undefined ? null : formatMoney(isDebt ? balance.net_receivable : isCredit ? balance.credit_balance : "0", { suffix });
  const overdue: string | undefined = isDebt && balance !== undefined && balance.days_overdue > 0 ? t("stats.overdueDays", { count: balance.days_overdue, formatted: formatNumber(balance.days_overdue, i18n.language) }) : undefined;
  if (amount === null) return null;
  return <StatTile label={label} value={amount} hint={overdue} />;
}

export function StudentStatTiles({ studentId, courses, performance, showBalance }: StudentStatTilesProps) {
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
  if (scoreValue === null && attendanceValue === null && !showBalance) return null;

  return (
    <div data-profile-summary>
      <StatGroup compact>
        {scoreValue !== null ? <StatTile label={t("stats.score")} value={scoreValue} /> : null}
        {attendanceValue !== null ? <StatTile label={t("stats.attendance")} value={attendanceValue} hint={absencesHint} /> : null}
        {showBalance ? <BalanceTile studentId={studentId} /> : null}
      </StatGroup>
    </div>
  );
}

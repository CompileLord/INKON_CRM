import { useTranslation } from "react-i18next";
import { formatNumber } from "../../i18n/formatters";
import { compareMoney, formatTjs } from "../../lib/money";
import { useStudentBalance } from "../../lib/finance/hooks";

interface StudentBalancePillProps {
  studentId: number;
}

export function StudentBalancePill({ studentId }: StudentBalancePillProps) {
  const { t, i18n } = useTranslation("studentProfile");
  const { data: balance } = useStudentBalance(studentId);
  if (balance === undefined) return null;
  const isDebt: boolean = compareMoney(balance.net_receivable, "0") > 0;
  const isCredit: boolean = !isDebt && compareMoney(balance.credit_balance, "0") > 0;
  if (!isDebt && !isCredit) return null;
  const amount: string = formatTjs(isDebt ? balance.net_receivable : balance.credit_balance, { lng: i18n.language });
  const overdue: string | null = isDebt && balance.days_overdue > 0
    ? t("stats.overdueDays", { count: balance.days_overdue, formatted: formatNumber(balance.days_overdue, i18n.language) })
    : null;
  const tone: string = isDebt ? "bg-danger-surface text-destructive" : "bg-success-surface text-success";
  return (
    <span data-balance-pill={isDebt ? "debt" : "credit"} className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium tabular-nums ${tone}`}>
      <span>{isDebt ? t("stats.debt") : t("stats.credit")} {amount}</span>
      {overdue ? <span className="font-normal">· {overdue}</span> : null}
    </span>
  );
}

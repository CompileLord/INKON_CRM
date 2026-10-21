import { useTranslation } from "react-i18next";
import type { DebtItem } from "../../lib/finance/types";
import { CourseBalanceIdentity } from "../../lib/finance/courseBalanceIdentity";
import { formatExactMoney } from "../../lib/money";
import { formatNumber } from "../../i18n/formatters";

interface CourseBalanceRowProps {
  debt: DebtItem;
  showStudentNumber: boolean;
  onAcceptPayment: (debt: DebtItem) => void;
}

export function CourseBalanceRow({ debt, showStudentNumber, onAcceptPayment }: CourseBalanceRowProps) {
  const { t, i18n } = useTranslation("finance");
  const studentName: string = CourseBalanceIdentity.displayName(debt);
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-[10px] px-3 py-2 text-sm text-ink hover:bg-row-hover">
      <div className="min-w-0 flex-1 basis-40 break-words">
        <p className="font-medium">{studentName}</p>
        {showStudentNumber && (
          <p className="text-sm text-muted tabular-nums">{t("analytics.studentNumber", { id: formatNumber(debt.student.id, i18n.language) })}</p>
        )}
        <p className="text-muted">
          {debt.course.title}
          {debt.overdue_days > 0 && <span className="tabular-nums"> · {t("overdueDaysCount", { count: debt.overdue_days })}</span>}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <p className="min-w-0 break-words font-semibold tabular-nums">{t("moneyAmount", { amount: formatExactMoney(debt.debt) })}</p>
        <button
          type="button"
          aria-label={t("row.acceptFor", { student: studentName, course: debt.course.title })}
          onClick={() => onAcceptPayment(debt)}
          className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-[10px] px-3 text-sm font-medium text-maroon-text hover:bg-strip focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-[background-color,transform] motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.96]"
        >
          {t("row.pay")}
        </button>
      </div>
    </li>
  );
}

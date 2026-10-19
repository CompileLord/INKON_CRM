import { Clock, Plus } from "lucide-react";
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
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 py-3 text-sm text-ink">
      <div className="min-w-0 flex-1 basis-40 break-words">
        <p className="font-medium">{studentName}</p>
        {showStudentNumber && (
          <p className="text-xs text-muted tabular-nums">
            {t("analytics.studentNumber", { id: formatNumber(debt.student.id, i18n.language) })}
          </p>
        )}
        <p className="mt-0.5 text-muted">{debt.course.title}</p>
        {debt.overdue_days > 0 && (
          <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-warning-surface px-2 py-0.5 text-xs text-warning tabular-nums">
            <Clock size={12} aria-hidden="true" />
            {t("overdueDaysCount", { count: debt.overdue_days })}
          </span>
        )}
      </div>
      <div className="flex w-full items-center justify-between gap-2 @[30rem]:w-auto @[30rem]:justify-end @[30rem]:gap-4">
        <p className="min-w-0 break-words text-base font-semibold tabular-nums">{t("moneyAmount", { amount: formatExactMoney(debt.debt) })}</p>
        <button
          type="button"
          aria-label={t("row.acceptFor", { student: studentName, course: debt.course.title })}
          onClick={() => onAcceptPayment(debt)}
          className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1 rounded-[10px] px-3 text-sm font-medium text-maroon-text hover:bg-strip focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-[background-color,transform] motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.96]"
        >
          <Plus size={16} aria-hidden="true" />
          {t("row.pay")}
        </button>
      </div>
    </li>
  );
}

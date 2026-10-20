import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { DebtItem } from "../../lib/finance/types";
import { formatExactMoney } from "../../lib/money";
import { formatNumber } from "../../i18n/formatters";
import { Button } from "../ui/Button";
import { DebtorDetails } from "./DebtorDetails";
import { DebtorOverdue } from "./DebtorOverdue";

interface DebtorRowProps {
  debt: DebtItem;
  rowKey: string;
  showStudentNumber: boolean;
  canOpenProfile: boolean;
  isExpanded: boolean;
  onToggleDetails: (rowKey: string) => void;
  onAcceptPayment: (debt: DebtItem) => void;
  extraAction?: ReactNode;
}

export function DebtorRow({ debt, rowKey, showStudentNumber, canOpenProfile, isExpanded, onToggleDetails, onAcceptPayment, extraAction }: DebtorRowProps) {
  const { t, i18n } = useTranslation("finance");
  const studentName: string = `${debt.student.first_name} ${debt.student.last_name}`;
  const detailsId: string = `debtor-details-${rowKey}`;

  return (
    <li data-row-key={rowKey} className="text-sm text-ink">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-[10px] px-3 py-2 hover:bg-row-hover">
        <div className="min-w-0 flex-1 basis-48 break-words">
          {canOpenProfile ? (
            <Link
              to={`/students/${debt.student.id}`}
              aria-label={t("debtorsTab.openProfile", { student: studentName })}
              className="font-medium text-ink hover:text-maroon-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {studentName}
            </Link>
          ) : (
            <p className="font-medium text-ink">{studentName}</p>
          )}
          {showStudentNumber && <p className="text-muted tabular-nums">{t("analytics.studentNumber", { id: formatNumber(debt.student.id, i18n.language) })}</p>}
          <p className="text-muted"><span>{debt.course.title}</span> · <DebtorOverdue days={debt.overdue_days} /></p>
        </div>
        <p className="shrink-0 font-semibold tabular-nums">{t("moneyAmount", { amount: formatExactMoney(debt.debt) })}</p>
        <div data-debtor-actions className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
          {extraAction}
          <Button
            variant="secondary"
            aria-expanded={isExpanded}
            aria-controls={detailsId}
            aria-label={t("debtorsTab.detailsFor", { student: studentName, course: debt.course.title })}
            onClick={() => onToggleDetails(rowKey)}
          >
            {t(isExpanded ? "debtorsTab.hideDetails" : "debtorsTab.details")}
          </Button>
          <Button variant="secondary" aria-label={t("row.acceptFor", { student: studentName, course: debt.course.title })} onClick={() => onAcceptPayment(debt)}>
            {t("row.pay")}
          </Button>
        </div>
      </div>
      {isExpanded && <DebtorDetails id={detailsId} debt={debt} />}
    </li>
  );
}

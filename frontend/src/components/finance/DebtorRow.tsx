import { ChevronDown, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { DebtItem } from "../../lib/finance/types";
import { formatExactMoney } from "../../lib/money";
import { formatNumber } from "../../i18n/formatters";
import { DebtorDetails } from "./DebtorDetails";
import { DebtorOverdue } from "./DebtorOverdue";
import { QUIET_ACTION_CLASSES as quietActionClasses } from "./quietActionClasses";

interface DebtorRowProps {
  debt: DebtItem;
  rowKey: string;
  layout: "table" | "list";
  showStudentNumber: boolean;
  canOpenProfile: boolean;
  isExpanded: boolean;
  onToggleDetails: (rowKey: string) => void;
  onAcceptPayment: (debt: DebtItem) => void;
}


export function DebtorRow({ debt, rowKey, layout, showStudentNumber, canOpenProfile, isExpanded, onToggleDetails, onAcceptPayment }: DebtorRowProps) {
  const { t, i18n } = useTranslation("finance");
  const studentName: string = `${debt.student.first_name} ${debt.student.last_name}`;
  const detailsId: string = `debtor-details-${rowKey}`;
  const amount: string = t("moneyAmount", { amount: formatExactMoney(debt.debt) });

  const identity = (
    <div className="min-w-0 break-words">
      {canOpenProfile ? (
        <Link
          to={`/students/${debt.student.id}`}
          aria-label={t("debtorsTab.openProfile", { student: studentName })}
          className="font-medium text-ink underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {studentName}
        </Link>
      ) : (
        <p className="font-medium text-ink">{studentName}</p>
      )}
      {showStudentNumber && (
        <p className="text-xs text-muted tabular-nums">
          {t("analytics.studentNumber", { id: formatNumber(debt.student.id, i18n.language) })}
        </p>
      )}
      <p className="mt-0.5 text-muted">{debt.course.title}</p>
    </div>
  );

  const payAction = (
    <button
      type="button"
      aria-label={t("row.acceptFor", { student: studentName, course: debt.course.title })}
      onClick={() => onAcceptPayment(debt)}
      className={quietActionClasses}
    >
      <Plus size={16} aria-hidden="true" />
      {t("row.pay")}
    </button>
  );

  const detailsAction = (
    <button
      type="button"
      aria-expanded={isExpanded}
      aria-controls={detailsId}
      aria-label={t("debtorsTab.detailsFor", { student: studentName, course: debt.course.title })}
      onClick={() => onToggleDetails(rowKey)}
      className={quietActionClasses + " text-muted"}
    >
      <ChevronDown size={16} aria-hidden="true" className={isExpanded ? "rotate-180" : ""} />
      <span>{t(isExpanded ? "debtorsTab.hideDetails" : "debtorsTab.details")}</span>
    </button>
  );

  if (layout === "table") {
    return (
      <>
        <tr data-row-key={rowKey} className="text-sm text-ink hover:bg-row-hover motion-safe:transition-colors motion-safe:duration-150">
          <td className="px-4 py-3">{identity}</td>
          <td className="px-3 py-3 text-right font-semibold tabular-nums">{amount}</td>
          <td className="px-3 py-3">
            <DebtorOverdue days={debt.overdue_days} />
          </td>
          <td className="px-3 py-3">
            <div className="flex items-center justify-end gap-1">
              {payAction}
              {detailsAction}
            </div>
          </td>
        </tr>
        {isExpanded && (
          <tr>
            <td colSpan={4} className="p-0">
              <DebtorDetails id={detailsId} debt={debt} />
            </td>
          </tr>
        )}
      </>
    );
  }

  return (
    <li data-row-key={rowKey} className="text-sm text-ink">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 py-3">
        <div className="min-w-0 flex-1 basis-40">
          {identity}
          <div className="mt-1">
            <DebtorOverdue days={debt.overdue_days} />
          </div>
        </div>
        <p className="shrink-0 text-base font-semibold tabular-nums">{amount}</p>
        <div className="flex w-full items-center justify-end gap-1">
          {detailsAction}
          {payAction}
        </div>
      </div>
      {isExpanded && <DebtorDetails id={detailsId} debt={debt} />}
    </li>
  );
}

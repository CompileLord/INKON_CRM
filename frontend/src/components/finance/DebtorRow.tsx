import type { MouseEvent, ReactNode } from "react";
import { Link } from "react-router-dom";
import { BellOff, ChevronDown, MessageSquare, Send } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { DebtItem } from "../../lib/finance/types";
import { formatExactMoney } from "../../lib/money";
import { formatDateTime, formatNumber } from "../../i18n/formatters";
import { DebtReminders } from "../../lib/finance/debtReminders";
import { Button } from "../ui/Button";
import { PersonAvatar } from "../ui/PersonAvatar";
import { GrantBadge } from "../enrollments/GrantBadge";
import { DebtorDetails } from "./DebtorDetails";

interface DebtorRowProps {
  debt: DebtItem;
  rowKey: string;
  showStudentNumber: boolean;
  canOpenProfile: boolean;
  isExpanded: boolean;
  onToggleDetails: (rowKey: string) => void;
  onAcceptPayment: (debt: DebtItem) => void;
  extraAction?: ReactNode;
  onRemind?: (debt: DebtItem) => void;
  isReminding?: boolean;
}

export function DebtorRow({ debt, rowKey, showStudentNumber, canOpenProfile, isExpanded, onToggleDetails, onAcceptPayment, extraAction, onRemind, isReminding = false }: DebtorRowProps) {
  const { t, i18n } = useTranslation("finance");
  const studentName: string = `${debt.student.first_name} ${debt.student.last_name}`;
  const detailsId: string = `debtor-details-${rowKey}`;
  const canRemind: boolean = DebtReminders.canRemind(debt);
  const viaSms: boolean = debt.reminder_channel === "sms";
  const ChannelIcon = canRemind ? (viaSms ? MessageSquare : Send) : BellOff;
  const lastSent: string = debt.last_reminder_at ? ` · ${t("reminders.lastSent", { when: formatDateTime(debt.last_reminder_at, i18n.language) })}` : "";
  const channelHint: string = canRemind
    ? `${viaSms ? t("reminders.destinationSms", { destination: (debt.reminder_masked_destination ?? "").replaceAll(" ", " ") }) : t("reminders.destinationTelegram")}${lastSent}`
    : t("reminders.noChannel");

  const toggleFromRow = (event: MouseEvent<HTMLDivElement>): void => {
    if ((event.target as HTMLElement).closest("a, button")) return;
    onToggleDetails(rowKey);
  };

  return (
    <li data-row-key={rowKey} className="text-sm text-ink">
      <div
        onClick={toggleFromRow}
        className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-2 rounded-[10px] px-3 py-2 hover:bg-row-hover motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out sm:flex-nowrap"
      >
        <PersonAvatar firstName={debt.student.first_name} lastName={debt.student.last_name} size={32} />
        <div className="flex min-w-0 flex-1 basis-40 flex-col sm:flex-row sm:items-center sm:gap-3">
          {canOpenProfile ? (
            <Link
              to={`/students/${debt.student.id}`}
              aria-label={t("debtorsTab.openProfile", { student: studentName })}
              className="truncate font-medium text-ink hover:text-maroon-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {studentName}
            </Link>
          ) : (
            <p className="truncate font-medium text-ink">{studentName}</p>
          )}
          {showStudentNumber && <span className="text-muted tabular-nums">{t("analytics.studentNumber", { id: formatNumber(debt.student.id, i18n.language) })}</span>}
          <p className="flex min-w-0 items-center gap-2 text-muted">
            <span className="truncate">{debt.course.title}</span>
            <GrantBadge billingMode={debt.billing_mode} />
          </p>
        </div>
        {debt.overdue_days > 0 && (
          <span className="shrink-0 rounded-full bg-danger-surface px-2.5 py-0.5 text-xs font-medium text-destructive tabular-nums">{t("overdueDaysCount", { count: debt.overdue_days })}</span>
        )}
        <span role="img" aria-label={channelHint} title={channelHint} className="shrink-0 text-muted">
          <ChannelIcon size={16} aria-hidden="true" />
        </span>
        <p className="shrink-0 text-right font-semibold tabular-nums">{t("moneyAmount", { amount: formatExactMoney(debt.debt) })}</p>
        <div data-debtor-actions className="flex shrink-0 items-center gap-2">
          {extraAction}
          {onRemind && (
            <Button variant="secondary" disabled={!canRemind} loading={isReminding} aria-label={t("reminders.actionFor", { student: studentName })} onClick={() => onRemind(debt)}>
              {t("reminders.action")}
            </Button>
          )}
          <Button variant="secondary" aria-label={t("row.acceptFor", { student: studentName, course: debt.course.title })} onClick={() => onAcceptPayment(debt)}>
            {t("row.pay")}
          </Button>
          <button
            type="button"
            aria-expanded={isExpanded}
            aria-controls={detailsId}
            aria-label={t("debtorsTab.detailsFor", { student: studentName, course: debt.course.title })}
            onClick={() => onToggleDetails(rowKey)}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-[10px] text-muted hover:bg-strip focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-[background-color,transform] motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.96]"
          >
            <ChevronDown size={18} aria-hidden="true" className={`motion-safe:transition-transform motion-safe:duration-200 ${isExpanded ? "rotate-180" : ""}`} />
          </button>
        </div>
      </div>
      {isExpanded && <DebtorDetails id={detailsId} debt={debt} />}
    </li>
  );
}

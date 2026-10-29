import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { formatDate, formatDateTime, formatRecentRelativeTime, formatTjs, SCHOOL_TIMEZONE } from "../../i18n/formatters";
import { NotificationPresentation } from "../../lib/notifications/NotificationPresentation";
import type { DeliveryLogItem } from "../../lib/notifications/types";
import type { Role } from "../../lib/users/types";
import { Button } from "../ui/Button";
import { DeliveryStatusChip } from "./DeliveryStatusChip";

interface DeliveryItemCardProps {
  item: DeliveryLogItem;
  role: Role | null;
  userId: number | null;
  retrying: boolean;
  onRetry: (id: number) => void;
}

const LINK_CLASS: string = "rounded underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring";

export function DeliveryItemCard({ item, role, userId, retrying, onRetry }: DeliveryItemCardProps) {
  const { t, i18n } = useTranslation("notifications");
  const kind = NotificationPresentation.eventKind(item.type);
  const Icon = NotificationPresentation.categoryIcon(item.type);
  const recipient: string = item.recipient_name ?? t("deliveryLog.unknownRecipient");
  const studentLink: boolean = item.recipient_name != null && NotificationPresentation.canOpenStudent(role, userId, item.student_id);
  const courseLink: boolean = NotificationPresentation.canOpenCourse(role, userId, item.course_id);
  const sentText: string = item.sent_at
    ? formatRecentRelativeTime(item.sent_at, i18n.language) ?? formatDateTime(item.sent_at, i18n.language, SCHOOL_TIMEZONE)
    : t("deliveryLog.notSent");
  const reason: string | null = NotificationPresentation.knownReason(item.reason);
  const hasContext: boolean = Boolean(item.course_title) || item.amount != null || item.score != null;

  return (
    <li data-testid="delivery-item" className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-3 motion-safe:transition-[background-color] motion-safe:duration-150 motion-safe:ease-out hover:bg-row-hover sm:flex-row sm:items-start">
      <div className="flex min-w-0 flex-1 items-start gap-3">
      <span data-testid="delivery-icon" data-kind={kind} className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-strip text-muted">
        <Icon size={16} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="break-words text-sm font-medium text-ink">
            {studentLink ? <Link to={`/students/${item.student_id}`} className={LINK_CLASS}>{recipient}</Link> : recipient}
          </p>
          <DeliveryStatusChip status={item.status} attempts={item.attempts} />
        </div>
        <p className="break-words text-sm text-muted">{t(`events.${kind}.title`)}</p>
        {reason && <p data-testid="delivery-reason" className="break-words text-sm text-muted">{t(`deliveryLog.reasons.${reason}`)}</p>}
        {hasContext && (
          <p data-testid="delivery-context" className="flex flex-wrap items-center gap-x-1.5 text-sm text-ink">
            {item.course_title && (courseLink ? <Link to={`/courses/${item.course_id}`} className={LINK_CLASS}>{item.course_title}</Link> : <span>{item.course_title}</span>)}
            {item.course_title && (item.amount != null || item.score != null) && <span aria-hidden="true" className="text-muted">·</span>}
            {item.amount != null && <span className="tabular-nums">{formatTjs(item.amount, { lng: i18n.language })}</span>}
            {item.score != null && <span className="tabular-nums">{t("deliveryLog.score", { score: item.score })}</span>}
          </p>
        )}
        <p className="text-xs text-muted tabular-nums">
          <time dateTime={item.sent_at ?? item.notification_date}>{item.sent_at ? sentText : `${t("deliveryLog.notSent")} · ${formatDate(`${item.notification_date}T12:00:00+05:00`, i18n.language, SCHOOL_TIMEZONE)}`}</time>
        </p>
      </div>
      </div>
      {NotificationPresentation.canRetry(item) && (
        <Button type="button" variant="secondary" loading={retrying} onClick={() => onRetry(item.id)} className="w-full shrink-0 sm:w-auto">
          {t("deliveryLog.retry")}
        </Button>
      )}
    </li>
  );
}

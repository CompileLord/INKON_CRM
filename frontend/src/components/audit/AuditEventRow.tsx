import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatDateTime, formatRecentRelativeTime, formatTime, SCHOOL_TIMEZONE } from "../../i18n/formatters";
import type { AuditEvent } from "../../lib/audit/api";
import { AuditActionChip } from "./AuditActionChip";
import { AuditSentence } from "./AuditSentence";
import { useAuditEventText } from "./useAuditEventText";

interface AuditEventRowProps {
  event: AuditEvent;
  onOpen: (event: AuditEvent, trigger: HTMLButtonElement) => void;
}

export function AuditEventRow({ event, onOpen }: AuditEventRowProps) {
  const { t, i18n } = useTranslation("audit");
  const { subtitle } = useAuditEventText(event);
  const language: string = i18n.language;
  const timeText: string = formatRecentRelativeTime(event.created_at, language) ?? formatTime(event.created_at, language, SCHOOL_TIMEZONE);

  return (
    <li>
      <button
        type="button"
        data-audit-row={event.id}
        aria-haspopup="dialog"
        title={t("row.open")}
        onClick={(click) => onOpen(event, click.currentTarget)}
        className="flex min-h-[4.5rem] w-full items-start gap-3 px-4 py-3 text-left hover:bg-row-hover focus-visible:bg-row-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring motion-safe:transition-[background-color] motion-safe:duration-150 motion-safe:ease-out"
      >
        <AuditActionChip action={event.action} />
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 block break-words text-sm text-ink">
            <AuditSentence event={event} />
          </span>
          <span className="mt-0.5 line-clamp-2 block break-words text-sm text-muted">{subtitle}</span>
          <time dateTime={event.created_at} title={formatDateTime(event.created_at, language, SCHOOL_TIMEZONE)} className="mt-1 block text-xs text-label tabular-nums @[40rem]:hidden">
            {timeText}
          </time>
        </span>
        <time dateTime={event.created_at} title={formatDateTime(event.created_at, language, SCHOOL_TIMEZONE)} className="hidden shrink-0 pt-1 text-sm text-label tabular-nums @[40rem]:block">
          {timeText}
        </time>
        <ChevronRight size={18} aria-hidden="true" className="mt-2 shrink-0 text-muted" />
      </button>
    </li>
  );
}

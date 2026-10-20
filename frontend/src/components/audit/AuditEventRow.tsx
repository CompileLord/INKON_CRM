import { useTranslation } from "react-i18next";
import { formatDateTime, formatRecentRelativeTime, formatTime, SCHOOL_TIMEZONE } from "../../i18n/formatters";
import type { AuditEvent } from "../../lib/audit/api";
import { AuditActionChip } from "./AuditActionChip";
import { AuditSentence } from "./AuditSentence";
import { useAuditEventText } from "./useAuditEventText";

interface AuditEventRowProps {
  event: AuditEvent;
  onOpen: (event: AuditEvent, trigger: HTMLButtonElement) => void;
  similarCount?: number;
  onToggleSimilar?: () => void;
  isExpanded?: boolean;
}

export function AuditEventRow({ event, onOpen, similarCount = 1, onToggleSimilar, isExpanded = false }: AuditEventRowProps) {
  const { t, i18n } = useTranslation("audit");
  const { subtitle } = useAuditEventText(event);
  const language: string = i18n.language;
  const timeText: string = formatRecentRelativeTime(event.created_at, language) ?? formatTime(event.created_at, language, SCHOOL_TIMEZONE);
  const hasSimilar: boolean = similarCount > 1 && onToggleSimilar !== undefined;

  return (
    <li className="rounded-[10px]">
      <div className="flex items-start gap-1 hover:bg-row-hover">
        <button
          type="button"
          data-audit-row={event.id}
          aria-haspopup="dialog"
          title={t("row.open")}
          onClick={(click) => onOpen(event, click.currentTarget)}
          className="flex min-h-[4.5rem] min-w-0 flex-1 items-start gap-3 rounded-[10px] px-3 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          <AuditActionChip action={event.action} />
          <span className="min-w-0 flex-1">
            <span className="block break-words text-sm text-ink">
              <AuditSentence event={event} />
            </span>
            <span className="mt-0.5 block break-words text-sm text-muted">{subtitle}</span>
          </span>
          <time dateTime={event.created_at} title={formatDateTime(event.created_at, language, SCHOOL_TIMEZONE)} className="shrink-0 pt-0.5 text-sm text-muted tabular-nums">
            {timeText}
          </time>
        </button>
        {hasSimilar && (
          <button
            type="button"
            aria-expanded={isExpanded}
            onClick={onToggleSimilar}
            className="my-3 mr-2 inline-flex min-h-11 shrink-0 items-center rounded-[10px] px-3 text-sm font-medium text-maroon-text hover:bg-strip focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {isExpanded ? t("event.hideSimilar") : `${t("event.similarCount", { count: similarCount })} · ${t("event.showSimilar")}`}
          </button>
        )}
      </div>
    </li>
  );
}

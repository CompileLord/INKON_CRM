import { Clock, History, RefreshCw, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useAuditEvents } from "../../lib/audit/hooks";
import type { AuditEvent } from "../../lib/audit/api";
import { formatDateTime, formatRecentRelativeTime, formatTime, SCHOOL_TIMEZONE } from "../../i18n/formatters";
import { AuditActionChip } from "../audit/AuditActionChip";
import { AuditSentence } from "../audit/AuditSentence";
import { useAuditEventText } from "../audit/useAuditEventText";

interface ActivityEventRowProps {
  event: AuditEvent;
  phoneHidden: boolean;
}

function ActivityEventRow({ event, phoneHidden }: ActivityEventRowProps) {
  const { i18n } = useTranslation("dashboard");
  const { subtitle } = useAuditEventText(event);
  const language: string = i18n.language;
  const timeText: string = formatRecentRelativeTime(event.created_at, language) ?? formatTime(event.created_at, language, SCHOOL_TIMEZONE);
  return (
    <li className={`${phoneHidden ? "hidden lg:flex" : "flex"} min-w-0 items-start gap-2.5 px-2 py-3`}>
      <AuditActionChip action={event.action} />
      <div className="min-w-0 flex-1">
        <p className="break-words text-sm text-ink">
          <AuditSentence event={event} />
        </p>
        <p className="mt-0.5 flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-muted">
          {subtitle !== "" && <span className="min-w-0 break-words">{subtitle}</span>}
          <Clock size={11} aria-hidden="true" className="shrink-0" />
          <time dateTime={event.created_at} title={formatDateTime(event.created_at, language, SCHOOL_TIMEZONE)} className="tabular-nums">{timeText}</time>
        </p>
      </div>
    </li>
  );
}

export function ActivityFeed() {
  const { t } = useTranslation(["dashboard", "common"]);
  const { data, isLoading, isError, refetch } = useAuditEvents(1, 5);

  const events: AuditEvent[] = data?.items ?? [];

  return (
    <div className="flex h-full flex-col rounded-xl border border-border-warm bg-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-border-warm bg-strip px-5 py-3.5">
        <div className="flex items-center gap-2">
          <History size={18} className="text-info shrink-0" aria-hidden="true" />
          <h2 className="text-lg font-semibold leading-[26px] text-ink">
            {t("recentActivity")}
          </h2>
        </div>
      </div>

      <div className="flex-1 p-4">
        {data === undefined && isLoading ? (
          <div>
            <div className="flex lg:hidden flex-col divide-y divide-border-warm motion-safe:animate-pulse">
              {[0, 1, 2].map((i) => (
                <div key={i} className="py-3 px-2 flex items-start gap-2.5 min-w-0 max-w-full">
                  <div className="mt-0.5 h-7 w-7 rounded-full bg-strip shrink-0" />
                  <div className="flex-1 flex flex-col gap-2 min-w-0">
                    <div className="h-4 w-44 rounded bg-strip max-w-full" />
                    <div className="h-3 w-56 rounded bg-strip max-w-full" />
                  </div>
                </div>
              ))}
            </div>
            <div className="hidden lg:flex flex-col divide-y divide-border-warm motion-safe:animate-pulse">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="py-3 px-2 flex items-start gap-2.5 min-w-0 max-w-full">
                  <div className="mt-0.5 h-7 w-7 rounded-full bg-strip shrink-0" />
                  <div className="flex-1 flex flex-col gap-2 min-w-0">
                    <div className="h-4 w-44 rounded bg-strip max-w-full" />
                    <div className="h-3 w-56 rounded bg-strip max-w-full" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : data === undefined && isError ? (
          <div className="py-8 text-center flex flex-col items-center justify-center gap-2">
            <p className="text-xs font-semibold text-destructive">
              {t("errorLoadingActivity")}
            </p>
            <button
              type="button"
              onClick={() => refetch()}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-border bg-card px-4 text-xs font-medium text-ink [@media(hover:hover)_and_(pointer:fine)]:hover:bg-strip motion-safe:active:scale-[0.96] motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-out"
            >
              <RefreshCw size={13} aria-hidden="true" />
              <span>{t("common:retry")}</span>
            </button>
          </div>
        ) : events.length === 0 ? (
          <div className="py-8 text-center flex flex-col items-center justify-center gap-3">
            {isError && (
              <div className="w-full mb-2 flex flex-col gap-2 rounded-lg border border-border-warm bg-strip p-2.5 text-left">
                <span className="text-xs font-medium text-warning">
                  {t("staleFailedNotice")}
                </span>
                <button
                  type="button"
                  onClick={() => refetch()}
                  className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-medium text-ink [@media(hover:hover)_and_(pointer:fine)]:hover:bg-strip motion-safe:active:scale-[0.96] motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-out"
                >
                  <RefreshCw size={13} aria-hidden="true" />
                  <span>{t("common:retry")}</span>
                </button>
              </div>
            )}
            <p className="text-xs text-muted">
              {t("noRecentEvents")}
            </p>
          </div>
        ) : (
          <div>
            {isError && (
              <div className="mb-3 flex flex-col gap-2 rounded-lg border border-border-warm bg-strip p-2.5">
                <span className="text-xs font-medium text-warning">
                  {t("staleFailedNotice")}
                </span>
                <button
                  type="button"
                  onClick={() => refetch()}
                  className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-medium text-ink [@media(hover:hover)_and_(pointer:fine)]:hover:bg-strip motion-safe:active:scale-[0.96] motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-out"
                >
                  <RefreshCw size={13} aria-hidden="true" />
                  <span>{t("common:retry")}</span>
                </button>
              </div>
            )}
            <ul className="divide-y divide-border-warm">
              {events.map((event, index) => (
                <ActivityEventRow key={event.id} event={event} phoneHidden={index >= 3} />
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="border-t border-border-warm bg-card px-5 py-2">
        <Link
          to="/audit"
          className="inline-flex min-h-[44px] items-center gap-1.5 text-xs font-medium text-info [@media(hover:hover)_and_(pointer:fine)]:hover:underline motion-safe:active:scale-[0.96] motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-out"
        >
          <span>{t("viewAllActivity")}</span>
          <ChevronRight size={14} aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}

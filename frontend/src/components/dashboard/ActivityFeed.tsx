import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useAuditEvents } from "../../lib/audit/hooks";
import type { AuditEvent } from "../../lib/audit/api";
import { formatDateTime, formatRecentRelativeTime, formatTime, SCHOOL_TIMEZONE } from "../../i18n/formatters";
import { AuditSentence } from "../audit/AuditSentence";
import { useAuditEventText } from "../audit/useAuditEventText";
import { EmptyState } from "../ui/EmptyState";
import { ErrorState } from "../ui/ErrorState";
import { SectionCard } from "../ui/SectionCard";
import { StaleNotice } from "./StaleNotice";

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
    <li className={`${phoneHidden ? "hidden lg:flex" : "flex"} min-w-0 flex-col gap-0.5 px-3 py-3`}>
      <p className="break-words text-sm text-ink">
        <AuditSentence event={event} />
      </p>
      <p className="flex min-w-0 flex-wrap items-center gap-x-2 text-sm text-muted">
        {subtitle !== "" && <span className="min-w-0 break-words">{subtitle}</span>}
        <time dateTime={event.created_at} title={formatDateTime(event.created_at, language, SCHOOL_TIMEZONE)} className="tabular-nums">{timeText}</time>
      </p>
    </li>
  );
}

function ActivitySkeleton() {
  const { t } = useTranslation("common");
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-1">
      <span className="sr-only">{t("loading")}</span>
      {[0, 1, 2, 3, 4].map((index) => (
        <div key={index} className={`flex flex-col gap-2 px-3 py-3 motion-safe:animate-pulse ${index >= 3 ? "max-lg:hidden" : ""}`}>
          <div className="h-4 w-44 max-w-full rounded bg-border" />
          <div className="h-3 w-56 max-w-full rounded bg-border" />
        </div>
      ))}
    </div>
  );
}

export function ActivityFeed() {
  const { t } = useTranslation(["dashboard", "common"]);
  const { data, isLoading, isError, refetch } = useAuditEvents(1, 5);
  const events: AuditEvent[] = data?.items ?? [];

  return (
    <SectionCard
      title={t("recentActivity")}
      actions={<Link to="/audit" className="inline-flex min-h-11 items-center text-sm font-medium text-maroon-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{t("viewAllActivity")}</Link>}
    >
      {data === undefined && isLoading ? (
        <ActivitySkeleton />
      ) : data === undefined && isError ? (
        <ErrorState message={t("errorLoadingActivity")} onRetry={() => refetch()} />
      ) : (
        <div className="flex flex-col gap-2">
          {isError && <StaleNotice onRetry={() => refetch()} />}
          {events.length === 0 ? (
            <EmptyState title={t("noRecentEvents")} />
          ) : (
            <ul className="flex flex-col">
              {events.map((event, index) => (
                <ActivityEventRow key={event.id} event={event} phoneHidden={index >= 3} />
              ))}
            </ul>
          )}
        </div>
      )}
    </SectionCard>
  );
}

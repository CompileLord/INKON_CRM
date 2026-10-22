import { useState } from "react";
import { BellOff, Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatDate, formatRecentRelativeTime, formatTime, SCHOOL_TIMEZONE } from "../../i18n/formatters";
import { useMarkAllNotificationsRead, useMarkNotificationRead, useNotifications, useUnreadNotificationCount } from "../../lib/notifications/hooks";
import { NotificationPresentation, type NotificationEventKind } from "../../lib/notifications/NotificationPresentation";
import type { NotificationLogItem } from "../../lib/notifications/types";
import { Button } from "../ui/Button";
import { ErrorState } from "../ui/ErrorState";
import { Pagination } from "../ui/Pagination";

function InboxSkeleton() {
  const { t } = useTranslation("common");
  return (
    <ul aria-busy="true" aria-label={t("loading")} className="flex flex-col rounded-2xl border border-border bg-card p-1">
      {Array.from({ length: 5 }, (_, index) => (
        <li key={index} className="flex gap-3 px-3 py-3">
          <div className="h-4 w-4 shrink-0 rounded bg-border motion-safe:animate-pulse" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-4 w-40 rounded bg-border motion-safe:animate-pulse" />
            <div className="h-3 w-64 max-w-full rounded bg-border motion-safe:animate-pulse" />
            <div className="h-3 w-16 rounded bg-border motion-safe:animate-pulse" />
          </div>
        </li>
      ))}
    </ul>
  );
}

function NotificationRow({ notification }: { notification: NotificationLogItem }) {
  const { t, i18n } = useTranslation("notifications");
  const markRead = useMarkNotificationRead();
  const kind: NotificationEventKind = NotificationPresentation.eventKind(notification.type);
  const unread: boolean = notification.read_at === null;
  const timeText: string | null = notification.sent_at
    ? formatRecentRelativeTime(notification.sent_at, i18n.language) ?? formatTime(notification.sent_at, i18n.language, SCHOOL_TIMEZONE)
    : null;

  return (
    <li data-testid="notification-item" data-unread={unread} className="flex items-start gap-3 rounded-[10px] px-3 py-3 motion-safe:transition-[background-color] motion-safe:duration-150 motion-safe:ease-out hover:bg-row-hover">
      <div className="min-w-0 flex-1">
        <p className={`break-words text-sm text-ink ${unread ? "font-semibold" : "font-medium"}`}>{t(`events.${kind}.title`)}</p>
        <p className="mt-0.5 break-words text-sm text-muted">{t(`events.${kind}.body`)}</p>
        {timeText && <time dateTime={notification.sent_at ?? undefined} className="mt-1 block text-sm text-muted tabular-nums">{timeText}</time>}
        {markRead.isError && <p role="alert" className="mt-1 text-sm text-destructive">{t("markReadFailed")}</p>}
      </div>
      {unread && (
        <>
          <span data-testid="unread-dot" role="img" aria-label={t("unread")} className="mt-2 size-2.5 shrink-0 rounded-full bg-maroon" />
          <Button
            type="button"
            variant="secondary"
            loading={markRead.isPending || undefined}
            aria-label={t("markRead")}
            title={t("markRead")}
            onClick={() => markRead.mutate(notification.id)}
            className="shrink-0 border-transparent bg-transparent px-3 text-muted shadow-none hover:text-ink"
          >
            <Check size={16} aria-hidden="true" />
          </Button>
        </>
      )}
    </li>
  );
}

export function NotificationInbox() {
  const { t, i18n } = useTranslation(["notifications", "common"]);
  const [page, setPage] = useState<number>(1);
  const inbox = useNotifications(page);
  const unreadCount = useUnreadNotificationCount();
  const markAll = useMarkAllNotificationsRead();

  const items: NotificationLogItem[] = inbox.data?.items ?? [];
  const hasUnread: boolean = (unreadCount.data?.unread_count ?? NotificationPresentation.countUnread(items)) > 0;
  const groups = NotificationPresentation.groupByDay(items);

  const dayHeading = (day: string): string => {
    const relation = NotificationPresentation.relateDay(day);
    if (relation === "today") return t("notifications:days.today");
    if (relation === "yesterday") return t("notifications:days.yesterday");
    return formatDate(`${day}T12:00:00+05:00`, i18n.language, SCHOOL_TIMEZONE);
  };

  if (inbox.isLoading) return <InboxSkeleton />;

  if (inbox.isError && !inbox.data) {
    return (
      <div className="rounded-2xl border border-border bg-card">
        <ErrorState message={t("notifications:loadFailed")} onRetry={() => void inbox.refetch()} />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div data-testid="inbox-empty" className="flex items-center gap-3 px-1 py-2">
        <BellOff size={20} aria-hidden="true" className="shrink-0 text-muted" />
        <div className="flex min-w-0 flex-col">
          <p className="text-sm font-medium text-ink">{t("notifications:inboxEmpty")}</p>
          <p className="text-sm text-muted">{t("notifications:inboxEmptyNextStep")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted tabular-nums" role="status">
          {hasUnread ? t("notifications:unreadSummary", { count: unreadCount.data?.unread_count ?? NotificationPresentation.countUnread(items) }) : t("notifications:allRead")}
        </p>
        <Button type="button" variant="secondary" loading={markAll.isPending} disabled={!hasUnread} onClick={() => markAll.mutate()}>
          {t("notifications:markAllRead")}
        </Button>
      </div>
      {markAll.isError && <p role="alert" className="text-sm text-destructive">{t("notifications:markAllFailed")}</p>}
      {groups.map((group) => (
        <section key={group.day} aria-label={dayHeading(group.day)}>
          <h2 className="mb-2 px-1 text-sm font-semibold text-muted">{dayHeading(group.day)}</h2>
          <ul className="flex flex-col rounded-2xl border border-border bg-card p-1">
            {group.items.map((notification) => <NotificationRow key={notification.id} notification={notification} />)}
          </ul>
        </section>
      ))}
      {(inbox.data?.total_pages ?? 1) > 1 && (
        <div className="flex justify-end">
          <Pagination page={page} totalPages={inbox.data?.total_pages ?? 1} onPageChange={setPage} />
        </div>
      )}
    </div>
  );
}

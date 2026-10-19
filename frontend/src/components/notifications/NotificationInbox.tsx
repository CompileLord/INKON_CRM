import { useState } from "react";
import { Award, Bell, BellOff, CalendarClock, Check, CheckCheck, Wallet, ShieldAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatDate, formatRecentRelativeTime, formatTime, SCHOOL_TIMEZONE } from "../../i18n/formatters";
import { useMarkAllNotificationsRead, useMarkNotificationRead, useNotifications, useUnreadNotificationCount } from "../../lib/notifications/hooks";
import { NotificationPresentation, type NotificationEventKind } from "../../lib/notifications/NotificationPresentation";
import type { NotificationLogItem } from "../../lib/notifications/types";
import { Button } from "../ui/Button";
import { Pagination } from "../ui/Pagination";

const EVENT_ICONS: Record<NotificationEventKind, typeof Bell> = {
  examResult: Award,
  paymentTwoDays: CalendarClock,
  paymentOneDay: Wallet,
  telegramLockout: ShieldAlert,
  generic: Bell,
};

function InboxSkeleton() {
  const { t } = useTranslation("common");
  return (
    <ul aria-busy="true" aria-label={t("loading")} className="divide-y divide-border rounded-[14px] border border-border bg-card">
      {Array.from({ length: 5 }, (_, index) => (
        <li key={index} className="flex gap-3 px-4 py-3">
          <div className="h-10 w-10 shrink-0 rounded-[10px] bg-strip motion-safe:animate-pulse" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-4 w-40 rounded bg-strip motion-safe:animate-pulse" />
            <div className="h-3 w-64 max-w-full rounded bg-strip motion-safe:animate-pulse" />
            <div className="h-3 w-16 rounded bg-strip motion-safe:animate-pulse" />
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
  const Icon = EVENT_ICONS[kind];
  const unread: boolean = notification.read_at === null;
  const timeText: string | null = notification.sent_at
    ? formatRecentRelativeTime(notification.sent_at, i18n.language) ?? formatTime(notification.sent_at, i18n.language, SCHOOL_TIMEZONE)
    : null;

  return (
    <li data-testid="notification-item" data-unread={unread} className="flex items-start gap-3 px-4 py-3 motion-safe:transition-[background-color] motion-safe:duration-150 motion-safe:ease-out hover:bg-row-hover">
      <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-strip text-maroon dark:text-accent">
        <Icon size={20} />
      </span>
      <div className="min-w-0 flex-1">
        <p className={`break-words text-sm text-ink ${unread ? "font-semibold" : "font-medium"}`}>{t(`events.${kind}.title`)}</p>
        <p className="mt-0.5 break-words text-sm text-muted">{t(`events.${kind}.body`)}</p>
        {timeText && <time dateTime={notification.sent_at ?? undefined} className="mt-1 block text-xs text-label tabular-nums">{timeText}</time>}
        {markRead.isError && <p role="alert" className="mt-1 text-sm text-destructive">{t("markReadFailed")}</p>}
      </div>
      {unread && (
        <>
          <span data-testid="unread-dot" role="img" aria-label={t("unread")} className="mt-4 h-2.5 w-2.5 shrink-0 rounded-full bg-maroon dark:bg-accent" />
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
      <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-border bg-card px-4 py-4">
        <p className="text-sm text-destructive">{t("notifications:loadFailed")}</p>
        <Button type="button" variant="secondary" onClick={() => void inbox.refetch()}>{t("common:retry")}</Button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-[14px] border border-border bg-card px-6 py-12 text-center">
        <span aria-hidden="true" className="flex h-14 w-14 items-center justify-center rounded-full bg-strip text-muted"><BellOff size={28} /></span>
        <p className="max-w-sm text-sm text-muted">{t("notifications:inboxEmpty")}</p>
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
          <CheckCheck size={16} aria-hidden="true" />
          {t("notifications:markAllRead")}
        </Button>
      </div>
      {markAll.isError && <p role="alert" className="text-sm text-destructive">{t("notifications:markAllFailed")}</p>}
      {groups.map((group) => (
        <section key={group.day} aria-label={dayHeading(group.day)}>
          <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-label">{dayHeading(group.day)}</h2>
          <ul className="divide-y divide-border overflow-hidden rounded-[14px] border border-border bg-card">
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

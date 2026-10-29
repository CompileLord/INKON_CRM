import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useMarkNotificationRead, useNotifications, useUnreadNotificationCount } from "../../lib/notifications/hooks";
import type { NotificationLogItem } from "../../lib/notifications/types";
import { formatDate } from "../../i18n/formatters";
import { Button } from "../ui/Button";
import { NotificationPresentation } from "../../lib/notifications/NotificationPresentation";
import { useAuthStore } from "../../store/authStore";

function NotificationRow({ notification }: { notification: NotificationLogItem }) {
  const { t, i18n } = useTranslation("common");
  const mutation = useMarkNotificationRead();
  const read = Boolean(notification.read_at);
  const key = notification.type === "exam_result" ? "result" : notification.type === "payment_reminder_1d" || notification.type === "payment_reminder_2d" ? "reminder" : "generic";
  return <li className={`space-y-2 border-b border-border py-3 ${read ? "" : "font-medium"}`}>
    <p className="text-ink">{t(`shell.events.${key}`)}</p>
    <p className="text-sm text-muted">{formatDate(notification.notification_date, i18n.language)}</p>
    {read ? <p className="text-sm text-muted">{t("shell.read")}</p> : <><p className="text-sm text-muted">{t("shell.unreadState")}</p><Button type="button" variant="secondary" loading={mutation.isPending} onClick={() => mutation.mutate(notification.id)}>{t(mutation.isError ? "shell.retryRead" : "shell.markRead")}</Button></>}
    {mutation.isError && <p role="alert" className="text-sm text-destructive">{t("shell.readFailed")}</p>}
  </li>;
}
export function NotificationPopover({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation(["common", "notifications"]);
  const role = useAuthStore((state) => state.role);
  const query = useNotifications(1, 5);
  const unread = useUnreadNotificationCount();
  return <div>
    <div className="mb-3 space-y-2 text-sm text-muted" role="status">{unread.data ? unread.data.unread_count > 0 && <p className="tabular-nums">{t("shell.unread", { count: unread.data.unread_count })}</p> : <p>{t(unread.isError ? "shell.unreadUnavailable" : "loading")}</p>}{unread.isError && <Button type="button" variant="secondary" onClick={() => unread.refetch()}>{t("retry")}</Button>}</div>
    {!query.data && query.isPending ? <div aria-busy="true" aria-label={t("loading")} className="space-y-3">{Array.from({ length: 5 }, (_, index) => <div key={index} className="h-32 rounded-[10px] bg-strip motion-safe:animate-pulse"/>)}</div> : !query.data && query.isError ? <div className="space-y-3"><p role="alert" className="text-destructive">{t("shell.notificationsFailed")}</p><Button variant="secondary" onClick={() => query.refetch()}>{t("retry")}</Button></div> : query.data?.items.length === 0 ? <div className="py-4"><p className="text-sm font-medium text-ink">{t("notifications:inboxEmpty")}</p><p className="text-sm text-muted">{t(`notifications:inboxEmptyNextStep.${NotificationPresentation.emptyAudience(role)}`)}</p></div> : <ul>{query.data?.items.map((notification) => <NotificationRow key={notification.id} notification={notification}/>)}</ul>}
    {query.data && query.isError && <div className="space-y-2 py-3"><p role="status" className="text-muted">{t("shell.stale")}</p><Button variant="secondary" onClick={() => query.refetch()}>{t("retry")}</Button></div>}
    <Link to="/notifications" onClick={onClose} className="mt-4 flex min-h-11 items-center rounded-[10px] text-maroon-text underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-ring">{t("notifications:popoverHistory")}</Link>
  </div>;
}

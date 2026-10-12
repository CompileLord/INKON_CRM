import { useTranslation } from "react-i18next";
import { useUnreadNotificationCount } from "../../lib/notifications/hooks";

export function UnreadBadge() {
  const { t } = useTranslation("common");
  const query = useUnreadNotificationCount();
  if (!query.data) return <span className="sr-only">{t(query.isError ? "shell.unreadUnavailable" : "loading")}</span>;
  return <span className="text-xs tabular-nums" aria-label={t("shell.unread", { count: query.data.unread_count })}>{query.data.unread_count > 0 ? query.data.unread_count : <span className="sr-only">{t("shell.unread", { count: 0 })}</span>}{query.isError && <span className="sr-only">{t("shell.stale")}</span>}</span>;
}

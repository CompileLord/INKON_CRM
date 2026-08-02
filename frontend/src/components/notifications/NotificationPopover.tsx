import { Bell, ExternalLink, AlertTriangle, Info, CheckCircle, Check, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  useMarkNotificationRead,
  useNotifications,
  useUnreadNotificationCount,
} from "../../lib/notifications/hooks";
import { formatDate } from "../../i18n/formatters";
import { CardSkeleton } from "../ui/CardSkeleton";

interface NotificationPopoverProps {
  isOpen: boolean;
  onClose: () => void;
}

export function NotificationPopover({ isOpen, onClose }: NotificationPopoverProps) {
  const { i18n, t } = useTranslation(["notifications", "common"]);
  const { data: notifData, isLoading, isError, refetch } = useNotifications(1, 5);
  const { data: unreadData } = useUnreadNotificationCount();
  const markRead = useMarkNotificationRead();

  if (!isOpen) return null;

  const notifications = notifData?.items ?? [];
  const unreadCount = unreadData?.unread_count ?? 0;

  const getIcon = (type: string) => {
    switch (type) {
      case "payment_reminder_2d":
      case "payment_reminder_1d":
        return <AlertTriangle size={16} className="text-amber-600" />;
      case "exam_result":
        return <CheckCircle size={16} className="text-emerald-600" />;
      default:
        return <Info size={16} className="text-blue-600" />;
    }
  };

  return (
    <div className="absolute right-0 top-12 z-50 w-96 rounded-2xl border border-border bg-card p-4 shadow-xl animate-in fade-in zoom-in-95">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <Bell size={18} className="text-maroon" />
          <h4 className="text-sm font-bold text-ink">{t("title", "Уведомления")}</h4>
          <span className="rounded-full bg-maroon/10 px-2 py-0.5 text-[10px] font-bold text-maroon">
            {unreadCount}
          </span>
        </div>
      </div>

      <div className="my-3 flex flex-col gap-2 max-h-80 overflow-y-auto">
        {isLoading ? (
          <CardSkeleton rows={3} />
        ) : isError ? (
          <div className="py-6 text-center text-xs">
            <p className="text-rose-600 font-semibold">{t("errorLoading", "Ошибка загрузки")}</p>
            <button
              onClick={() => refetch()}
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1 text-xs font-medium text-ink hover:bg-cream"
            >
              <RefreshCw size={12} /> {t("common:retry", "Повторить")}
            </button>
          </div>
        ) : notifications.length === 0 ? (
          <div className="py-6 text-center text-xs text-muted">{t("noNotifications", "Уведомлений нет")}</div>
        ) : (
          notifications.map((n) => {
            const isRead = !!n.read_at;
            return (
              <div
                key={n.id}
                className={`flex items-start gap-3 rounded-xl p-3 text-xs transition-colors ${
                  isRead ? "bg-card hover:bg-cream/40" : "bg-maroon/5 border border-maroon/10 font-medium"
                }`}
              >
                <div className="mt-0.5 rounded-lg bg-cream p-1.5">{getIcon(n.type)}</div>
                <div className="flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <h5 className="font-bold text-ink text-xs">{n.type}</h5>
                    {!isRead && (
                      <button
                        onClick={() => markRead.mutate(n.id)}
                        title={t("markRead", "Отметить как прочитанное")}
                        className="rounded p-0.5 text-muted hover:text-maroon transition-colors"
                      >
                        <Check size={14} />
                      </button>
                    )}
                  </div>
                  <p className="text-muted text-[11px] mt-0.5 leading-relaxed">
                    {n.error_message || `Entity #${n.related_entity_id}`}
                  </p>
                  <span className="text-[10px] text-muted/70 mt-1 block">
                    {formatDate(n.notification_date, i18n.language)}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="border-t border-border pt-2.5 text-center">
        <Link
          to="/notifications"
          onClick={onClose}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-maroon hover:underline"
        >
          {t("viewHistory", "Посмотреть историю уведомлений")} <ExternalLink size={13} />
        </Link>
      </div>
    </div>
  );
}

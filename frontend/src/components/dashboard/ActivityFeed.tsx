import { History, Clock, ShieldCheck, DollarSign, UserCheck, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuditLogs } from "../../lib/audit/hooks";
import { Link } from "react-router-dom";
import { formatDateTime } from "../../i18n/formatters";
import { CardSkeleton } from "../ui/CardSkeleton";

export function ActivityFeed() {
  const { t, i18n } = useTranslation("dashboard");
  const { data, isLoading, isError, refetch } = useAuditLogs(1, 5);
  const logs = data?.items || [];

  const getActionIcon = (action: string) => {
    switch (action) {
      case "CREATE":
        return <UserCheck size={14} className="text-emerald-600 dark:text-emerald-400" />;
      case "UPDATE":
        return <ShieldCheck size={14} className="text-blue-600 dark:text-blue-400" />;
      case "DELETE":
        return <History size={14} className="text-rose-600 dark:text-rose-400" />;
      default:
        return <DollarSign size={14} className="text-amber-600 dark:text-amber-400" />;
    }
  };

  return (
    <div className="flex h-full flex-col rounded-xl border border-border-warm bg-card shadow-xs transition-[box-shadow,border-color] duration-200">
      <div className="flex items-center justify-between rounded-t-xl border-b border-border-warm bg-strip px-5 py-3.5">
        <div className="flex items-center gap-2">
          <History size={16} className="text-blue-600 dark:text-blue-400" />
          <h3 className="text-[15px] font-semibold text-ink">{t("recentActivity")}</h3>
        </div>
        <Link to="/audit" className="text-xs text-blue-600 dark:text-blue-400 hover:underline active:scale-95 transition-transform duration-150">
          {t("auditJournal")} →
        </Link>
      </div>

      <div className="flex-1 px-5 py-4">
        {isLoading ? (
          <CardSkeleton rows={3} />
        ) : isError ? (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <p className="text-xs font-semibold text-rose-600">{t("errorLoading", "Ошибка загрузки активности")}</p>
            <button
              onClick={() => refetch()}
              className="mt-2 flex items-center gap-1.5 rounded-lg border border-border px-3 py-1 text-xs font-medium text-ink hover:bg-cream active:scale-95 transition-[background-color,transform] duration-150 ease-out"
            >
              <RefreshCw size={12} /> {t("retry", "Повторить")}
            </button>
          </div>
        ) : logs.length === 0 ? (
          <p className="text-xs text-muted">{t("noRecentEvents")}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {logs.map((item, index) => {
              const isLast = index === logs.length - 1;
              return (
                <li key={item.id} className="relative flex gap-3 pb-3 last:pb-0">
                  {!isLast && (
                    <span className="absolute left-[14px] top-[30px] h-[calc(100%-8px)] w-px bg-border-warm" />
                  )}
                  <span className="relative z-10 flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full border border-border bg-card shadow-xs ring-1 ring-black/5 dark:ring-white/10">
                    {getActionIcon(item.action)}
                  </span>
                  <div className="flex-1 rounded-lg border border-event-border bg-strip px-4 py-2.5 transition-colors duration-150 hover:border-border-warm">
                    <p className="text-xs font-semibold text-ink">
                      {item.user_name || "User"} • {item.action} {item.entity_type} <span className="tabular-nums">#{item.entity_id}</span>
                    </p>
                    {item.field_name && (
                      <p className="mt-0.5 text-[11px] font-mono text-muted tabular-nums">
                        {item.field_name}: {item.old_value || "—"} ➔ {item.new_value || "—"}
                      </p>
                    )}
                    <p className="mt-1 flex items-center gap-1 text-[10px] text-muted tabular-nums">
                      <Clock size={10} />
                      {formatDateTime(item.created_at, i18n.language)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

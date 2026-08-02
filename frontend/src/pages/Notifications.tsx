import { useState } from "react";
import { Bell, CheckCircle2, AlertTriangle, RefreshCw, Filter, Search, Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatDateTime } from "../i18n/formatters";
import { useMarkNotificationRead, useNotifications } from "../lib/notifications/hooks";
import { Pagination } from "../components/ui/Pagination";
import { TableSkeletonRows } from "../components/ui/TableSkeletonRows";
import { TableErrorState } from "../components/ui/TableErrorState";

export function Notifications() {
  const { t, i18n } = useTranslation(["notifications", "common"]);
  const [page, setPage] = useState<number>(1);
  const { data, isLoading, isError, refetch } = useNotifications(page);
  const markRead = useMarkNotificationRead();

  const logs = data?.items ?? [];
  const totalPages = data?.total_pages ?? 1;

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const filtered = logs.filter((log) => {
    const matchesStatus = statusFilter === "ALL" || log.status.toUpperCase() === statusFilter;
    const matchesQuery =
      log.recipient.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.type.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (log.error_message || "").toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesQuery;
  });

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-ink flex items-center gap-2">
            <Bell className="text-maroon" size={24} /> {t("title")}
          </h2>
          <p className="text-xs text-muted">{t("subtitle")}</p>
        </div>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-xs font-semibold text-ink shadow-xs hover:bg-cream"
        >
          <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} /> {t("common:refresh")}
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" size={16} />
          <input
            type="text"
            placeholder={t("searchPlaceholder", "Поиск по уведомлениям...")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-border bg-card py-2.5 pl-10 pr-4 text-xs text-ink placeholder:text-muted focus:border-maroon focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter size={15} className="text-muted" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border border-border bg-card px-3 py-2.5 text-xs font-semibold text-ink focus:border-maroon focus:outline-none"
          >
            <option value="ALL">{t("allStatuses", "Все статусы")}</option>
            <option value="SENT">{t("sent", "Отправлено")}</option>
            <option value="FAILED">{t("failed", "Ошибка")}</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border text-muted uppercase">
                <th className="pb-3 font-semibold">ID</th>
                <th className="pb-3 font-semibold">{t("audit:time", "Время")}</th>
                <th className="pb-3 font-semibold">{t("recipient", "Получатель")}</th>
                <th className="pb-3 font-semibold">{t("type", "Тип")}</th>
                <th className="pb-3 font-semibold">{t("message", "Сообщение / Детали")}</th>
                <th className="pb-3 font-semibold">{t("common:status", "Статус")}</th>
                <th className="pb-3 font-semibold text-right">{t("common:actions", "Действия")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50 text-ink">
              {isLoading ? (
                <TableSkeletonRows columns={7} rows={5} />
              ) : isError ? (
                <TableErrorState columns={7} onRetry={() => refetch()} />
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-muted">
                    {t("common:noData")}
                  </td>
                </tr>
              ) : (
                filtered.map((log) => (
                  <tr key={log.id} className="hover:bg-cream/40 transition-colors">
                    <td className="py-3.5 font-mono text-muted font-medium tabular-nums">#{log.id}</td>
                    <td className="py-3.5 text-muted whitespace-nowrap tabular-nums">
                      {formatDateTime(log.sent_at || log.notification_date, i18n.language)}
                    </td>
                    <td className="py-3.5 font-bold text-ink">{log.recipient}</td>
                    <td className="py-3.5 font-mono text-[11px] text-muted">{log.type}</td>
                    <td className="py-3.5 text-muted max-w-xs truncate tabular-nums">
                      {log.error_message || `Related Entity ID #${log.related_entity_id}`}
                    </td>
                    <td className="py-3.5">
                      {log.status.toLowerCase() === "sent" ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-950/70 px-2.5 py-0.5 text-xs font-bold text-emerald-700 dark:text-emerald-300 ring-1 ring-black/5 dark:ring-white/10">
                          <CheckCircle2 size={13} /> {t("sent", "Отправлено")}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 dark:bg-rose-950/70 px-2.5 py-0.5 text-xs font-bold text-rose-700 dark:text-rose-300 ring-1 ring-black/5 dark:ring-white/10 tabular-nums">
                          <AlertTriangle size={13} /> {t("failed", "Ошибка")} ({log.attempts})
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 text-right">
                      {!log.read_at ? (
                        <button
                          onClick={() => markRead.mutate(log.id)}
                          className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-muted hover:bg-cream hover:text-ink active:scale-95 transition-[background-color,transform,color] duration-150 ease-out"
                        >
                          <Check size={12} /> {t("markRead", "Прочитано")}
                        </button>
                      ) : (
                        <span className="text-[11px] text-muted">{t("read", "Прочитано")}</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="mt-4 flex justify-end border-t border-border/50 pt-4">
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        )}
      </div>
    </div>
  );
}

import { useState } from "react";
import { ShieldCheck, Search, Filter, Eye, RefreshCw, Layers } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuditLogs } from "../lib/audit/hooks";
import type { AuditLogItem } from "../lib/audit/api";
import { formatDateTime } from "../i18n/formatters";
import { Pagination } from "../components/ui/Pagination";
import { TableSkeletonRows } from "../components/ui/TableSkeletonRows";
import { TableErrorState } from "../components/ui/TableErrorState";

export function Audit() {
  const { t, i18n } = useTranslation(["audit", "common"]);
  const [page, setPage] = useState<number>(1);
  const { data, isLoading, isError, refetch } = useAuditLogs(page);
  const logs = data?.items ?? [];
  const totalPages = data?.total_pages ?? 1;
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [actionFilter, setActionFilter] = useState<string>("ALL");
  const [selectedLog, setSelectedLog] = useState<AuditLogItem | null>(null);

  const getActionBadge = (action: string) => {
    switch (action) {
      case "CREATE":
        return <span className="inline-flex items-center rounded-full bg-emerald-50 dark:bg-emerald-950/70 px-2.5 py-0.5 text-xs font-bold text-emerald-700 dark:text-emerald-300 ring-1 ring-black/5 dark:ring-white/10">CREATE</span>;
      case "UPDATE":
        return <span className="inline-flex items-center rounded-full bg-blue-50 dark:bg-blue-950/70 px-2.5 py-0.5 text-xs font-bold text-blue-700 dark:text-blue-300 ring-1 ring-black/5 dark:ring-white/10">UPDATE</span>;
      case "DELETE":
        return <span className="inline-flex items-center rounded-full bg-rose-50 dark:bg-rose-950/70 px-2.5 py-0.5 text-xs font-bold text-rose-700 dark:text-rose-300 ring-1 ring-black/5 dark:ring-white/10">DELETE</span>;
      default:
        return <span className="inline-flex items-center rounded-full bg-purple-50 dark:bg-purple-950/70 px-2.5 py-0.5 text-xs font-bold text-purple-700 dark:text-purple-300 ring-1 ring-black/5 dark:ring-white/10">{action}</span>;
    }
  };

  const filteredLogs = logs.filter((log) => {
    const matchesAction = actionFilter === "ALL" || log.action === actionFilter;
    const matchesQuery =
      (log.user_name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.entity_type.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (log.field_name || "").toLowerCase().includes(searchQuery.toLowerCase());
    return matchesAction && matchesQuery;
  });

  return (
    <div className="flex flex-col gap-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-ink flex items-center gap-2">
            <ShieldCheck className="text-maroon dark:text-accent" size={24} /> {t("title")}
          </h2>
          <p className="text-xs text-muted">{t("subtitle")}</p>
        </div>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-xs font-semibold text-ink shadow-xs hover:bg-cream active:scale-95 transition-[background-color,transform] duration-150 ease-out"
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
            placeholder={t("common:search")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-border bg-card py-2.5 pl-10 pr-4 text-xs text-ink placeholder:text-muted focus:border-maroon focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter size={15} className="text-muted" />
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="rounded-xl border border-border bg-card px-3 py-2.5 text-xs font-semibold text-ink focus:border-maroon focus:outline-none"
          >
            <option value="ALL">{t("filterAction")}</option>
            <option value="CREATE">CREATE</option>
            <option value="UPDATE">UPDATE</option>
            <option value="DELETE">DELETE</option>
          </select>
        </div>
      </div>

      {/* Main Audit Table */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border text-muted uppercase">
                <th className="pb-3 font-semibold">ID</th>
                <th className="pb-3 font-semibold">{t("time")}</th>
                <th className="pb-3 font-semibold">{t("user")}</th>
                <th className="pb-3 font-semibold">{t("action")}</th>
                <th className="pb-3 font-semibold">{t("entity")}</th>
                <th className="pb-3 font-semibold">{t("field")}</th>
                <th className="pb-3 font-semibold text-right">{t("common:actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50 text-ink">
              {isLoading ? (
                <TableSkeletonRows columns={7} rows={5} />
              ) : isError ? (
                <TableErrorState columns={7} onRetry={() => refetch()} />
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-muted">
                    {t("empty")}
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-cream/40 transition-colors">
                    <td className="py-3.5 font-mono text-muted font-medium tabular-nums">#{log.id}</td>
                    <td className="py-3.5 text-muted whitespace-nowrap tabular-nums">
                      {formatDateTime(log.created_at, i18n.language)}
                    </td>
                    <td className="py-3.5 font-bold text-ink">{log.user_name || `User #${log.user_id}`}</td>
                    <td className="py-3.5">{getActionBadge(log.action)}</td>
                    <td className="py-3.5">
                      <span className="font-semibold text-ink">{log.entity_type}</span>
                      <span className="ml-1 text-muted font-mono tabular-nums">#{log.entity_id}</span>
                    </td>
                    <td className="py-3.5">
                      {log.field_name ? (
                        <div className="flex items-center gap-1.5 font-mono text-[11px]">
                          <span className="font-semibold text-ink">{log.field_name}:</span>
                          <span className="text-rose-600 dark:text-rose-400 line-through tabular-nums">{log.old_value || "null"}</span>
                          <span className="text-muted">➔</span>
                          <span className="text-emerald-700 dark:text-emerald-400 font-bold tabular-nums">{log.new_value || "null"}</span>
                        </div>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="py-3.5 text-right">
                      <button
                        onClick={() => setSelectedLog(log)}
                        className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-muted hover:bg-cream hover:text-ink active:scale-95 transition-[background-color,transform,color] duration-150 ease-out"
                      >
                        <Eye size={13} /> {t("common:details")}
                      </button>
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

      {/* Inspector Modal Drawer */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <h3 className="text-lg font-bold text-ink flex items-center gap-2">
                <Layers size={18} className="text-maroon dark:text-accent" /> {t("common:details")} <span className="tabular-nums">#{selectedLog.id}</span>
              </h3>
              <button
                onClick={() => setSelectedLog(null)}
                className="rounded-lg p-1 text-muted hover:bg-cream hover:text-ink active:scale-95 transition-transform"
              >
                ✕
              </button>
            </div>
            <div className="mt-4 flex flex-col gap-3 text-xs">
              <div>
                <span className="font-semibold text-muted">{t("user")}:</span>{" "}
                <span className="font-bold text-ink">{selectedLog.user_name}</span>
              </div>
              <div>
                <span className="font-semibold text-muted">{t("time")}:</span>{" "}
                <span className="text-ink tabular-nums">{formatDateTime(selectedLog.created_at, i18n.language)}</span>
              </div>
              <div>
                <span className="font-semibold text-muted">{t("entity")}:</span>{" "}
                <span className="text-ink font-mono tabular-nums">{selectedLog.entity_type} (ID: {selectedLog.entity_id})</span>
              </div>
              <div className="mt-2 rounded-xl bg-slate-950 p-4 text-emerald-400 font-mono text-[11px] overflow-x-auto tabular-nums">
                <pre>{JSON.stringify(selectedLog, null, 2)}</pre>
              </div>
            </div>
            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setSelectedLog(null)}
                className="rounded-xl bg-maroon px-4 py-2 text-xs font-semibold text-white hover:bg-maroon-dark active:scale-95 transition-[background-color,transform] duration-150 ease-out"
              >
                {t("common:close")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

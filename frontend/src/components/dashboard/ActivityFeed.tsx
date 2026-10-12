import { History, Clock, ShieldCheck, DollarSign, UserCheck, RefreshCw, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useAuditLogs } from "../../lib/audit/hooks";
import { formatDateTime } from "../../i18n/formatters";

export function ActivityFeed() {
  const { t, i18n } = useTranslation(["dashboard", "common"]);
  const { data, isLoading, isError, refetch } = useAuditLogs(1, 5);
  const logs = data?.items ?? [];

  const getActionIcon = (action: string) => {
    const act = action.toLowerCase();
    if (act === "create") {
      return <UserCheck size={14} className="text-success shrink-0" aria-hidden="true" />;
    }
    if (act === "update") {
      return <ShieldCheck size={14} className="text-info shrink-0" aria-hidden="true" />;
    }
    if (act === "delete") {
      return <History size={14} className="text-destructive shrink-0" aria-hidden="true" />;
    }
    return <DollarSign size={14} className="text-warning shrink-0" aria-hidden="true" />;
  };

  const formatValue = (value: string | null | undefined, fieldName?: string): string => {
    if (value === null || value === undefined || value === "") return "—";
    const field = fieldName?.toLowerCase();
    const val = value.toLowerCase();

    if (field === "status") {
      const statusKey = `status_${val}`;
      const translated = t(statusKey);
      if (translated !== statusKey) return translated;
    }

    if (field === "role") {
      const roleKey = `role_${val}`;
      const translated = t(roleKey);
      if (translated !== roleKey) return translated;
    }

    if (field === "attendance") {
      if (val === "true" || val === "1") {
        return t("attendance_present");
      }
      if (val === "false" || val === "0") {
        return t("attendance_absent");
      }
    }

    if (field === "payment_method" || field === "method") {
      const methodKey = `method_${val}`;
      const translated = t(methodKey);
      if (translated !== methodKey) return translated;
    }

    if (value === "0") return "0";

    return String(value);
  };

  const getActionLabel = (action: string): string => {
    const act = action.toLowerCase();
    const key = `action_${act}`;
    const translated = t(key);
    if (translated !== key) return translated;
    const legacyKey = `action${act.charAt(0).toUpperCase()}${act.slice(1)}`;
    const legacyTranslated = t(legacyKey);
    if (legacyTranslated !== legacyKey) return legacyTranslated;
    return t("unknownAction");
  };

  const getEntityLabel = (entityType: string): string => {
    const act = entityType.toLowerCase();
    const key = `entity_${act}`;
    const translated = t(key);
    if (translated !== key) return translated;
    const legacyKey = `entity${act.charAt(0).toUpperCase()}${act.slice(1)}`;
    const legacyTranslated = t(legacyKey);
    if (legacyTranslated !== legacyKey) return legacyTranslated;
    return t("unknownEntity");
  };

  const getFieldLabel = (fieldName: string): string => {
    const act = fieldName.toLowerCase();
    const key = `field_${act}`;
    const translated = t(key);
    if (translated !== key) return translated;
    const legacyKey = `field${act.charAt(0).toUpperCase()}${act.slice(1)}`;
    const legacyTranslated = t(legacyKey);
    if (legacyTranslated !== legacyKey) return legacyTranslated;
    return t("unknownField");
  };

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
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-border bg-card px-4 text-xs font-medium text-ink [@media(hover:hover)_and_(pointer:fine)]:hover:bg-strip motion-safe:active:scale-[0.96] motion-safe:transition-transform duration-150 ease-out"
            >
              <RefreshCw size={13} aria-hidden="true" />
              <span>{t("common:retry")}</span>
            </button>
          </div>
        ) : logs.length === 0 ? (
          <div className="py-8 text-center flex flex-col items-center justify-center gap-3">
            {isError && (
              <div className="w-full mb-2 flex flex-col gap-2 rounded-lg border border-border-warm bg-strip p-2.5 text-left">
                <span className="text-xs font-medium text-warning">
                  {t("staleFailedNotice")}
                </span>
                <button
                  type="button"
                  onClick={() => refetch()}
                  className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-medium text-ink [@media(hover:hover)_and_(pointer:fine)]:hover:bg-strip motion-safe:active:scale-[0.96] motion-safe:transition-transform duration-150 ease-out"
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
                  className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-medium text-ink [@media(hover:hover)_and_(pointer:fine)]:hover:bg-strip motion-safe:active:scale-[0.96] motion-safe:transition-transform duration-150 ease-out"
                >
                  <RefreshCw size={13} aria-hidden="true" />
                  <span>{t("common:retry")}</span>
                </button>
              </div>
            )}
            <ul className="divide-y divide-border-warm">
              {logs.map((item, index) => {
                const actor = item.user_id ? t("userWithId", { id: item.user_id }) : t("systemUser");
                const isDesktopOnly = index >= 3;

                return (
                  <li
                    key={item.id}
                    className={
                      isDesktopOnly
                        ? "hidden lg:flex items-start gap-2.5 py-3 px-2 min-w-0"
                        : "flex items-start gap-2.5 py-3 px-2 min-w-0"
                    }
                  >
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-card">
                      {getActionIcon(item.action)}
                    </span>
                    <div className="flex-1 min-w-0">
                      {item.action === "update" ? (
                        <p className="text-sm font-medium text-ink break-words">
                          {getFieldLabel(item.field_name)}:{" "}
                          <span className="tabular-nums font-semibold">{formatValue(item.old_value, item.field_name)}</span>
                          {" ➔ "}
                          <span className="tabular-nums font-semibold">{formatValue(item.new_value, item.field_name)}</span>
                        </p>
                      ) : item.action === "create" ? (
                        <p className="text-sm font-medium text-ink break-words">
                          {getActionLabel(item.action)} {getEntityLabel(item.entity_type)}
                          {item.field_name && item.new_value !== null && item.new_value !== undefined ? (
                            <>
                              : {getFieldLabel(item.field_name)} ={" "}
                              <span className="tabular-nums font-semibold">
                                {formatValue(item.new_value, item.field_name)}
                              </span>
                            </>
                          ) : null}
                        </p>
                      ) : (
                        <p className="text-sm font-medium text-ink break-words">
                          {getActionLabel(item.action)} {getEntityLabel(item.entity_type)}
                        </p>
                      )}
                      <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted tabular-nums">
                        <span>{actor}</span>
                        <span>•</span>
                        <span>
                          {getEntityLabel(item.entity_type)} #{item.entity_id}
                        </span>
                        <span>•</span>
                        <Clock size={11} aria-hidden="true" className="shrink-0" />
                        <span>{formatDateTime(item.created_at, i18n.language)}</span>
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      <div className="border-t border-border-warm bg-card px-5 py-2">
        <Link
          to="/audit"
          className="inline-flex min-h-[44px] items-center gap-1.5 text-xs font-medium text-info [@media(hover:hover)_and_(pointer:fine)]:hover:underline motion-safe:active:scale-[0.96] motion-safe:transition-transform duration-150 ease-out"
        >
          <span>{t("viewAllActivity")}</span>
          <ChevronRight size={14} aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}

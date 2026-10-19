import { useRef, type KeyboardEvent } from "react";
import { PageHeader } from "../components/PageHeader";
import { Bell } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { DeliveryLog } from "../components/notifications/DeliveryLog";
import { NotificationInbox } from "../components/notifications/NotificationInbox";
import { InfoTooltip } from "../components/ui/InfoTooltip";
import { useAuthStore } from "../store/authStore";

type NotificationsTab = "inbox" | "log";

const TABS: readonly NotificationsTab[] = ["inbox", "log"];

export function Notifications() {
  const { t } = useTranslation("notifications");
  const role = useAuthStore((state) => state.role);
  const [searchParams, setSearchParams] = useSearchParams();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const canSeeLog: boolean = role === "superadmin";
  const tab: NotificationsTab = canSeeLog && searchParams.get("tab") === "log" ? "log" : "inbox";
  const failedOnly: boolean = tab === "log" && searchParams.get("failed") === "1";
  const rawPage: number = Number(searchParams.get("page"));
  const page: number = Number.isInteger(rawPage) && rawPage >= 1 ? rawPage : 1;

  const updateQuery = (next: { tab?: NotificationsTab; failed?: boolean; page?: number }): void => {
    const query = new URLSearchParams();
    const nextTab: NotificationsTab = next.tab ?? tab;
    if (nextTab === "log") query.set("tab", "log");
    if (nextTab === "log" && (next.failed ?? failedOnly)) query.set("failed", "1");
    if (nextTab === "log" && (next.page ?? page) > 1) query.set("page", String(next.page ?? page));
    setSearchParams(query);
  };

  const moveTab = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    const target: number | null =
      event.key === "ArrowRight" ? (index + 1) % TABS.length
      : event.key === "ArrowLeft" ? (index + TABS.length - 1) % TABS.length
      : event.key === "Home" ? 0
      : event.key === "End" ? TABS.length - 1
      : null;
    if (target === null) return;
    event.preventDefault();
    updateQuery({ tab: TABS[target], failed: false, page: 1 });
    tabRefs.current[target]?.focus();
  };

  return (
    <div className="mx-auto flex w-full max-w-[960px] flex-col gap-6 pb-8">
      <PageHeader
        titleIcon={<Bell size={24} aria-hidden="true" className="shrink-0 text-maroon-text dark:text-accent" />}
        title={t("title")}
        info={<InfoTooltip label={t("title")}>{t(canSeeLog ? "titleInfoAdmin" : "titleInfo")}</InfoTooltip>}
      />

      {canSeeLog && (
        <div role="tablist" aria-label={t("title")} className="inline-flex w-fit max-w-full rounded-[10px] border border-control-border bg-strip p-1">
          {TABS.map((id, index) => (
            <button
              key={id}
              ref={(element) => { tabRefs.current[index] = element; }}
              type="button"
              role="tab"
              id={`notifications-tab-${id}`}
              aria-selected={tab === id}
              aria-controls="notifications-panel"
              tabIndex={tab === id ? 0 : -1}
              onClick={() => updateQuery({ tab: id, failed: false, page: 1 })}
              onKeyDown={(event) => moveTab(event, index)}
              className={[
                "inline-flex min-h-11 items-center justify-center rounded-[8px] px-4 text-sm font-medium",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                "motion-safe:transition-[background-color,color,box-shadow] motion-safe:duration-150 motion-safe:ease-out",
                tab === id ? "bg-card text-ink shadow-xs" : "text-muted hover:text-ink",
              ].join(" ")}
            >
              {t(`tabs.${id}`)}
            </button>
          ))}
        </div>
      )}

      <div id="notifications-panel" role={canSeeLog ? "tabpanel" : undefined} aria-labelledby={canSeeLog ? `notifications-tab-${tab}` : undefined}>
        {tab === "log" ? (
          <DeliveryLog
            failedOnly={failedOnly}
            page={page}
            onFailedOnlyChange={(value) => updateQuery({ failed: value, page: 1 })}
            onPageChange={(value) => updateQuery({ page: value })}
          />
        ) : (
          <NotificationInbox />
        )}
      </div>
    </div>
  );
}

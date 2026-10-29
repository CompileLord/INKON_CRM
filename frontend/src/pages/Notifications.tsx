import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { DeliveryLog } from "../components/notifications/DeliveryLog";
import { NotificationInbox } from "../components/notifications/NotificationInbox";
import { PageContainer } from "../components/ui/PageContainer";
import { PageHeader } from "../components/ui/PageHeader";
import { TAB_PANEL_ENTER_CLASS, Tabs, tabElementId, tabPanelElementId, type TabDefinition } from "../components/ui/Tabs";
import { useAuthStore } from "../store/authStore";

type NotificationsTab = "inbox" | "log";

const TABS: readonly NotificationsTab[] = ["log", "inbox"];

export function Notifications() {
  const { t } = useTranslation("notifications");
  const role = useAuthStore((state) => state.role);
  const [searchParams, setSearchParams] = useSearchParams();

  const canSeeLog: boolean = role === "superadmin";
  const tab: NotificationsTab = canSeeLog && searchParams.get("tab") !== "inbox" ? "log" : "inbox";
  const failedOnly: boolean = tab === "log" && searchParams.get("failed") === "1";
  const rawPage: number = Number(searchParams.get("page"));
  const page: number = Number.isInteger(rawPage) && rawPage >= 1 ? rawPage : 1;

  const updateQuery = (next: { tab?: NotificationsTab; failed?: boolean; page?: number }): void => {
    const query = new URLSearchParams();
    const nextTab: NotificationsTab = next.tab ?? tab;
    if (nextTab === "inbox" && canSeeLog) query.set("tab", "inbox");
    if (nextTab === "log" && (next.failed ?? failedOnly)) query.set("failed", "1");
    if (nextTab === "log" && (next.page ?? page) > 1) query.set("page", String(next.page ?? page));
    setSearchParams(query);
  };

  const tabs: readonly TabDefinition[] = TABS.map((id: NotificationsTab) => ({ id, label: t(`tabs.${id}`) }));

  return (
    <PageContainer>
      <PageHeader title={t("title")} />

      {canSeeLog && (
        <Tabs tabs={tabs} value={tab} onChange={(id: string) => updateQuery({ tab: id as NotificationsTab, failed: false, page: 1 })} ariaLabel={t("title")} idPrefix="notifications" />
      )}

      <div
        key={tab}
        className={TAB_PANEL_ENTER_CLASS}
        id={tabPanelElementId("notifications", tab)}
        role={canSeeLog ? "tabpanel" : undefined}
        aria-labelledby={canSeeLog ? tabElementId("notifications", tab) : undefined}
      >
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
    </PageContainer>
  );
}

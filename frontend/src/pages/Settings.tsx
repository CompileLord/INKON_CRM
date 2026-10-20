import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AppearanceSection } from "../components/settings/AppearanceSection";
import { NotificationRulesSection } from "../components/settings/NotificationRulesSection";
import { OrganizationSection } from "../components/settings/OrganizationSection";
import { ProfileSection } from "../components/settings/ProfileSection";
import { useTransientToast } from "../components/settings/useTransientToast";
import { PageContainer } from "../components/ui/PageContainer";
import { PageHeader } from "../components/ui/PageHeader";
import { Tabs, tabElementId, tabPanelElementId, useTabParam, type TabDefinition } from "../components/ui/Tabs";
import { Toast } from "../components/ui/Toast";
import { useAuthStore } from "../store/authStore";

type SettingsSectionId = "profile" | "appearance" | "organization" | "rules";

const PERSONAL_SECTIONS: readonly SettingsSectionId[] = ["profile", "appearance"];
const ADMINISTRATOR_SECTIONS: readonly SettingsSectionId[] = ["organization", "rules"];
const ID_PREFIX: string = "settings";

export function Settings() {
  const { t } = useTranslation("settings");
  const role = useAuthStore((state) => state.role);
  const { toast, announce } = useTransientToast();

  const sectionIds: readonly SettingsSectionId[] = role === "superadmin" ? [...PERSONAL_SECTIONS, ...ADMINISTRATOR_SECTIONS] : PERSONAL_SECTIONS;
  const [activeId, selectSection] = useTabParam(sectionIds, "profile");
  const tabs: readonly TabDefinition[] = sectionIds.map((id: SettingsSectionId) => ({ id, label: t(`sections.${id}`) }));

  const announceSaved = (): void => announce(t("saved"));
  const announceFailed = (): void => announce(t("saveBar.failed"), "error");

  const content: Record<SettingsSectionId, ReactNode> = {
    profile: <ProfileSection role={role} onSaved={announceSaved} />,
    appearance: <AppearanceSection />,
    organization: <OrganizationSection onSaved={announceSaved} />,
    rules: <NotificationRulesSection onSaved={announceSaved} onFailed={announceFailed} />,
  };

  return (
    <PageContainer>
      <PageHeader title={t("title")} />
      <div className="grid gap-6 md:grid-cols-[14rem_minmax(0,1fr)] md:items-start">
        <Tabs tabs={tabs} value={activeId} onChange={selectSection} ariaLabel={t("navLabel")} orientation="vertical" idPrefix={ID_PREFIX} />
        <div
          role="tabpanel"
          id={tabPanelElementId(ID_PREFIX, activeId)}
          aria-labelledby={tabElementId(ID_PREFIX, activeId)}
          tabIndex={-1}
          className="min-w-0"
        >
          {content[activeId as SettingsSectionId]}
        </div>
      </div>
      <Toast message={toast.message} show={toast.show} variant={toast.variant} />
    </PageContainer>
  );
}

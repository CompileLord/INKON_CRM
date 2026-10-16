import { Bell, Building2, ChevronLeft, ChevronRight, Palette, Settings as SettingsIcon, User as UserIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AppearanceSection } from "../components/settings/AppearanceSection";
import { NotificationRulesSection } from "../components/settings/NotificationRulesSection";
import { OrganizationSection } from "../components/settings/OrganizationSection";
import { ProfileSection } from "../components/settings/ProfileSection";
import { useTransientToast } from "../components/settings/useTransientToast";
import { useDesktop } from "../components/shell/useDesktop";
import { Toast } from "../components/ui/Toast";
import { useAuthStore } from "../store/authStore";

type SettingsSectionId = "profile" | "appearance" | "organization" | "rules";

interface SectionDefinition {
  id: SettingsSectionId;
  icon: ReactNode;
}

const PERSONAL_SECTIONS: readonly SectionDefinition[] = [
  { id: "profile", icon: <UserIcon size={18} aria-hidden="true" /> },
  { id: "appearance", icon: <Palette size={18} aria-hidden="true" /> },
];

const ADMINISTRATOR_SECTIONS: readonly SectionDefinition[] = [
  { id: "organization", icon: <Building2 size={18} aria-hidden="true" /> },
  { id: "rules", icon: <Bell size={18} aria-hidden="true" /> },
];

export function Settings() {
  const { t } = useTranslation("settings");
  const role = useAuthStore((state) => state.role);
  const desktop: boolean = useDesktop();
  const [searchParams] = useSearchParams();
  const { toast, announce } = useTransientToast();

  const sections: readonly SectionDefinition[] = role === "superadmin" ? [...PERSONAL_SECTIONS, ...ADMINISTRATOR_SECTIONS] : PERSONAL_SECTIONS;
  const requested: string | null = searchParams.get("section");
  const requestedSection: SectionDefinition | undefined = sections.find((section) => section.id === requested);
  const activeId: SettingsSectionId | null = requestedSection?.id ?? (desktop ? "profile" : null);

  const announceSaved = (): void => announce(t("saved"));
  const announceFailed = (): void => announce(t("saveBar.failed"), "error");

  const sectionLink = (id: SettingsSectionId): string => `?section=${id}`;

  const content: Record<SettingsSectionId, ReactNode> = {
    profile: <ProfileSection role={role} onSaved={announceSaved} />,
    appearance: <AppearanceSection />,
    organization: <OrganizationSection onSaved={announceSaved} />,
    rules: <NotificationRulesSection onSaved={announceSaved} onFailed={announceFailed} />,
  };

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-6 pb-8">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-semibold leading-8 text-ink sm:text-[1.75rem] sm:leading-9">
          <SettingsIcon size={24} aria-hidden="true" className="shrink-0 text-maroon dark:text-accent" />
          {t("title")}
        </h1>
      </header>

      <div className="grid gap-6 lg:grid-cols-[14rem_minmax(0,1fr)] lg:items-start">
        <nav aria-label={t("navLabel")} className={activeId === null ? "block" : "hidden lg:block"}>
          <ul className="space-y-1 rounded-[14px] border border-border bg-card p-2 lg:sticky lg:top-24 lg:border-0 lg:bg-transparent lg:p-0">
            {sections.map((section) => {
              const selected: boolean = section.id === activeId;
              return (
                <li key={section.id}>
                  <Link
                    to={sectionLink(section.id)}
                    aria-current={selected ? "page" : undefined}
                    className={[
                      "flex min-h-12 items-center gap-3 rounded-[10px] px-3 text-sm font-medium",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      "motion-safe:transition-[background-color,color] motion-safe:duration-150 motion-safe:ease-out",
                      selected ? "bg-beige text-ink" : "text-nav hover:bg-row-hover hover:text-ink",
                    ].join(" ")}
                  >
                    <span className="shrink-0 text-muted">{section.icon}</span>
                    <span className="min-w-0 flex-1">{t(`sections.${section.id}`)}</span>
                    <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-muted lg:hidden" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className={activeId === null ? "hidden" : "min-w-0"}>
          {!desktop && (
            <Link to="?" className="mb-3 inline-flex min-h-11 items-center gap-1 rounded-[10px] pr-3 text-sm font-medium text-maroon focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-accent">
              <ChevronLeft size={18} aria-hidden="true" />
              {t("title")}
            </Link>
          )}
          {sections.map((section) => (
            <section key={section.id} hidden={section.id !== activeId} aria-labelledby={`settings-${section.id}-title`} className="space-y-4">
              <div>
                <h2 id={`settings-${section.id}-title`} className="text-lg font-semibold text-ink">{t(`sections.${section.id}`)}</h2>
                <p className="mt-0.5 text-sm text-muted">{t(`sectionHints.${section.id}`)}</p>
              </div>
              {content[section.id]}
            </section>
          ))}
        </div>
      </div>
      <Toast message={toast.message} show={toast.show} variant={toast.variant} />
    </div>
  );
}

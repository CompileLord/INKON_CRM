import { Info, Languages, Monitor, Moon, Palette, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SegmentedControl } from "../ui/SegmentedControl";
import { SettingsGroup, SettingsRow } from "./SettingsRow";
import { useThemeStore } from "../../store/themeStore";
import { FULL_VERSION_STRING } from "../../config/version";

const LANGUAGE_CODES: readonly string[] = ["ru", "tg", "en"];

export function AppearanceSection() {
  const { t, i18n } = useTranslation(["settings", "common"]);
  const theme = useThemeStore((state) => state.theme);
  const setTheme = useThemeStore((state) => state.setTheme);
  const activeLanguage: string = i18n.language.split("-")[0];

  return (
    <div className="space-y-4">
      <SettingsGroup>
        <SettingsRow icon={<Palette size={18} />} label={t("settings:appearance.theme")} description={t("settings:appearance.themeHint")}>
          <SegmentedControl
            ariaLabel={t("settings:appearance.theme")}
            value={theme}
            onChange={(mode) => setTheme(mode as "light" | "dark" | "system")}
            options={[
              { value: "light", label: t("settings:appearance.themeOptions.light"), icon: <Sun size={16} aria-hidden="true" /> },
              { value: "dark", label: t("settings:appearance.themeOptions.dark"), icon: <Moon size={16} aria-hidden="true" /> },
              { value: "system", label: t("settings:appearance.themeOptions.system"), icon: <Monitor size={16} aria-hidden="true" /> },
            ]}
          />
        </SettingsRow>
        <SettingsRow icon={<Languages size={18} />} label={t("settings:appearance.language")} description={t("settings:appearance.languageHint")}>
          <SegmentedControl
            ariaLabel={t("settings:appearance.language")}
            value={activeLanguage}
            onChange={(code) => void i18n.changeLanguage(code)}
            options={LANGUAGE_CODES.map((code) => ({
              value: code,
              label: t(`settings:appearance.languageCodes.${code}`),
              title: t(`common:shell.languages.${code}`),
            }))}
          />
        </SettingsRow>
      </SettingsGroup>
      <SettingsGroup title={t("settings:about.title")}>
        <SettingsRow icon={<Info size={18} />} label={t("settings:about.version")}>
          <p className="text-sm text-muted tabular-nums sm:text-right">{FULL_VERSION_STRING}</p>
        </SettingsRow>
      </SettingsGroup>
    </div>
  );
}

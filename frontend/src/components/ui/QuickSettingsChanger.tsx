import { Check, Sun, Moon, Monitor } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useThemeStore } from "../../store/themeStore";
import { Button } from "./Button";

export function QuickSettingsChanger() {
  const { t, i18n } = useTranslation("common");
  const { theme, setTheme } = useThemeStore();
  return <div className="space-y-6">
    <fieldset className="min-w-0"><legend className="mb-3 font-semibold text-ink">{t("shell.theme")}</legend><div className="grid gap-2">
      {([{ mode: "light", icon: Sun }, { mode: "dark", icon: Moon }, { mode: "system", icon: Monitor }] as const).map(({ mode, icon: Icon }) => <Button key={mode} type="button" variant="secondary" aria-pressed={theme === mode} onClick={() => setTheme(mode)} className="w-full justify-start"><Icon size={18} aria-hidden="true"/><span className="min-w-0 flex-1 break-words text-left">{t(`theme.${mode}`)}</span>{theme === mode && <Check size={18} aria-hidden="true"/>}</Button>)}
    </div></fieldset>
    <fieldset className="min-w-0"><legend className="mb-3 font-semibold text-ink">{t("shell.language")}</legend><div className="grid gap-2">{["en", "ru", "tg"].map((language) => <Button key={language} type="button" variant="secondary" aria-pressed={i18n.language.split("-")[0] === language} onClick={() => i18n.changeLanguage(language)} className="w-full justify-between"><span>{t(`shell.languages.${language}`)}</span>{i18n.language.split("-")[0] === language && <Check size={18} aria-hidden="true"/>}</Button>)}</div></fieldset>
  </div>;
}

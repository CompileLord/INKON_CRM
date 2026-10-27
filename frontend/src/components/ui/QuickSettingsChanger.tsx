import { Check, Sun, Moon, Monitor } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useThemeStore } from "../../store/themeStore";
import { Button } from "./Button";

interface QuickSettingsChangerProps {
  onNavigate?: () => void;
}

export function QuickSettingsChanger({ onNavigate }: QuickSettingsChangerProps) {
  const { t, i18n } = useTranslation(["common", "settings"]);
  const { theme, setTheme } = useThemeStore();
  return <div className="space-y-6">
    <fieldset className="min-w-0"><legend className="mb-3 font-semibold text-ink">{t("shell.theme")}</legend><div className="grid gap-2">
      {([{ mode: "light", icon: Sun }, { mode: "dark", icon: Moon }, { mode: "system", icon: Monitor }] as const).map(({ mode, icon: Icon }) => <Button key={mode} type="button" variant="secondary" aria-pressed={theme === mode} onClick={() => setTheme(mode)} className="w-full justify-start"><Icon size={18} aria-hidden="true"/><span className="min-w-0 flex-1 break-words text-left">{t(`theme.${mode}`)}</span>{theme === mode && <Check size={18} aria-hidden="true"/>}</Button>)}
    </div></fieldset>
    <fieldset className="min-w-0"><legend className="mb-3 font-semibold text-ink">{t("shell.language")}</legend><div className="grid gap-2">{["en", "ru", "tg"].map((language) => <Button key={language} type="button" variant="secondary" aria-pressed={i18n.language.split("-")[0] === language} onClick={() => i18n.changeLanguage(language)} className="w-full justify-between"><span>{t(`shell.languages.${language}`)}</span>{i18n.language.split("-")[0] === language && <Check size={18} aria-hidden="true"/>}</Button>)}</div></fieldset>
    {onNavigate && <Link to="/settings" onClick={onNavigate} className="flex min-h-11 items-center justify-end rounded-[10px] px-3 text-sm font-medium text-ink motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out hover:bg-row-hover focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.96]">{t("settings:allSettings")}</Link>}
  </div>;
}

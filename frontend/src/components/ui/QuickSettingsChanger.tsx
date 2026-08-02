import { useState } from "react";
import { Sun, Moon, Laptop } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useThemeStore } from "../../store/themeStore";

export function QuickSettingsChanger() {
  const { t, i18n } = useTranslation("common");
  const theme = useThemeStore((s) => s.theme);
  const effectiveTheme = useThemeStore((s) => s.effectiveTheme);
  const setTheme = useThemeStore((s) => s.setTheme);

  const [isOpen, setIsOpen] = useState(false);

  const currentLanguage = (i18n.language || "ru").slice(0, 2).toLowerCase();

  const languages = [
    { code: "ru", label: "RU" },
    { code: "tg", label: "TG" },
    { code: "en", label: "EN" },
  ];

  const isDark = effectiveTheme === "dark";

  return (
    <div
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
      onFocus={() => setIsOpen(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setIsOpen(false);
        }
      }}
      className="relative flex items-center"
    >
      <div
        className={[
          "flex items-center gap-1.5 rounded-full border border-border-warm bg-card p-1 shadow-xs transition-all duration-300 ease-out ring-1 ring-black/5 dark:ring-white/10",
          isOpen ? "px-2 shadow-md border-maroon/40 dark:border-accent/40" : "hover:border-border-warm hover:shadow-sm",
        ].join(" ")}
      >
        {/* Trigger Icon Button */}
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          aria-label={t("theme.settings", "Быстрые настройки темы и языка")}
          title={t("theme.settings", "Настройки темы и языка")}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted transition-[color,transform,background-color] duration-200 hover:bg-cream hover:text-ink active:scale-95"
        >
          {isDark ? (
            <Moon size={16} className="text-amber-400" />
          ) : (
            <Sun size={16} className="text-maroon dark:text-accent" />
          )}
        </button>

        {/* Collapsed Indicator Badge (shows language code when closed) */}
        {!isOpen && (
          <span className="mr-1 text-[11px] font-bold uppercase tracking-wider text-muted transition-opacity duration-200">
            {currentLanguage}
          </span>
        )}

        {/* Expandable Controls Drawer */}
        <div
          className={[
            "flex items-center gap-2 overflow-hidden transition-all duration-300 ease-out",
            isOpen ? "max-w-[280px] opacity-100 ml-0.5" : "max-w-0 opacity-0 pointer-events-none",
          ].join(" ")}
        >
          {/* Vertical Separator */}
          <div className="h-4 w-px bg-border-warm/80 shrink-0" />

          {/* Theme Controls Group */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setTheme("light")}
              title={t("theme.light", "Светлая тема")}
              aria-label={t("theme.light", "Светлая тема")}
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs transition-[background-color,color,transform,box-shadow] duration-150 active:scale-95 ${
                theme === "light"
                  ? "bg-amber-500 text-white shadow-xs scale-105"
                  : "text-muted hover:text-ink hover:bg-cream"
              }`}
            >
              <Sun size={14} />
            </button>

            <button
              type="button"
              onClick={() => setTheme("dark")}
              title={t("theme.dark", "Тёмная тема")}
              aria-label={t("theme.dark", "Тёмная тема")}
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs transition-[background-color,color,transform,box-shadow] duration-150 active:scale-95 ${
                theme === "dark"
                  ? "bg-maroon text-white dark:bg-accent shadow-xs scale-105"
                  : "text-muted hover:text-ink hover:bg-cream"
              }`}
            >
              <Moon size={14} />
            </button>

            <button
              type="button"
              onClick={() => setTheme("system")}
              title={t("theme.system", "Системная тема")}
              aria-label={t("theme.system", "Системная тема")}
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs transition-[background-color,color,transform,box-shadow] duration-150 active:scale-95 ${
                theme === "system"
                  ? "bg-accent text-white shadow-xs scale-105"
                  : "text-muted hover:text-ink hover:bg-cream"
              }`}
            >
              <Laptop size={13} />
            </button>
          </div>

          {/* Vertical Separator */}
          <div className="h-4 w-px bg-border-warm/80 shrink-0" />

          {/* Language Controls Group */}
          <div className="flex items-center gap-1 shrink-0">
            {languages.map((lang) => {
              const isActive = currentLanguage === lang.code;
              return (
                <button
                  key={lang.code}
                  type="button"
                  onClick={() => i18n.changeLanguage(lang.code)}
                  className={`rounded-full px-2 py-1 text-[11px] font-bold tracking-tight transition-[background-color,color,transform,box-shadow] duration-150 active:scale-95 ${
                    isActive
                      ? "bg-maroon text-white dark:bg-accent shadow-xs"
                      : "text-muted hover:bg-cream hover:text-ink"
                  }`}
                >
                  {lang.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

import { Sun, Moon, Laptop } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useThemeStore } from "../../store/themeStore";

export function ThemeToggle() {
  const { t } = useTranslation("common");
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);

  return (
    <div className="relative inline-flex items-center rounded-full border border-border bg-card p-1 shadow-xs transition-colors">
      <button
        type="button"
        onClick={() => setTheme("light")}
        title={t("theme.light", "Светлая тема")}
        aria-label={t("theme.light", "Светлая тема")}
        className={`flex h-7 w-7 items-center justify-center rounded-full transition-all duration-200 ${
          theme === "light"
            ? "bg-amber-500 text-white shadow-xs scale-105"
            : "text-muted hover:text-ink hover:bg-cream"
        }`}
      >
        <Sun size={15} />
      </button>

      <button
        type="button"
        onClick={() => setTheme("dark")}
        title={t("theme.dark", "Тёмная тема")}
        aria-label={t("theme.dark", "Тёмная тема")}
        className={`flex h-7 w-7 items-center justify-center rounded-full transition-all duration-200 ${
          theme === "dark"
            ? "bg-maroon text-white shadow-xs scale-105"
            : "text-muted hover:text-ink hover:bg-cream"
        }`}
      >
        <Moon size={15} />
      </button>

      <button
        type="button"
        onClick={() => setTheme("system")}
        title={t("theme.system", "Системная тема")}
        aria-label={t("theme.system", "Системная тема")}
        className={`flex h-7 w-7 items-center justify-center rounded-full transition-all duration-200 ${
          theme === "system"
            ? "bg-accent text-white shadow-xs scale-105"
            : "text-muted hover:text-ink hover:bg-cream"
        }`}
      >
        <Laptop size={14} />
      </button>
    </div>
  );
}

export function SingleThemeButton() {
  const { t } = useTranslation("common");
  const effectiveTheme = useThemeStore((s) => s.effectiveTheme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);

  const isDark = effectiveTheme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="relative flex h-9.5 w-9.5 items-center justify-center rounded-full border border-border bg-card text-muted hover:bg-cream hover:text-ink transition-colors shadow-xs group"
      title={isDark ? t("theme.switchToLight", "Переключить на светлую тему") : t("theme.switchToDark", "Переключить на тёмную тему")}
      aria-label={isDark ? t("theme.switchToLight", "Переключить на светлую тему") : t("theme.switchToDark", "Переключить на тёмную тему")}
    >
      {isDark ? (
        <Sun size={18} className="text-amber-400 group-hover:rotate-45 transition-transform duration-300" />
      ) : (
        <Moon size={18} className="text-maroon group-hover:-rotate-12 transition-transform duration-300" />
      )}
    </button>
  );
}

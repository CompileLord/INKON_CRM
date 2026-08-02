import { useTranslation } from "react-i18next";
import { Globe } from "lucide-react";

export function LanguageSwitcher() {
  const { i18n } = useTranslation();

  const currentLanguage = i18n.language || "ru";

  const languages = [
    { code: "ru", label: "RU" },
    { code: "tg", label: "TG" },
    { code: "en", label: "EN" },
  ];

  return (
    <div className="flex items-center gap-1 rounded-xl border border-border bg-card p-1 text-xs font-bold text-ink">
      <Globe size={14} className="ml-1 text-muted shrink-0" />
      {languages.map((lang) => {
        const isActive = currentLanguage.startsWith(lang.code);
        return (
          <button
            key={lang.code}
            type="button"
            onClick={() => i18n.changeLanguage(lang.code)}
            className={`rounded-lg px-2 py-1 text-xs font-bold transition-colors ${
              isActive
                ? "bg-maroon text-white shadow-xs"
                : "text-muted hover:bg-cream hover:text-ink"
            }`}
          >
            {lang.label}
          </button>
        );
      })}
    </div>
  );
}

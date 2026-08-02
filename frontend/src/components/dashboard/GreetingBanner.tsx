import { Shield } from "lucide-react";
import { useTranslation } from "react-i18next";

export function GreetingBanner() {
  const { t } = useTranslation("dashboard");

  return (
    <div className="rounded-2xl bg-gradient-to-r from-maroon/90 to-rose-900 px-8 py-7 text-white shadow-sm">
      <div className="flex items-center gap-2 text-xs font-semibold text-rose-200 uppercase tracking-wider mb-1">
        <Shield size={14} /> {t("crmControlPanel")}
      </div>
      <h2 className="text-2xl font-bold">{t("title")}</h2>
      <p className="mt-1 text-xs text-rose-100">{t("welcomeSubtitle")}</p>
    </div>
  );
}

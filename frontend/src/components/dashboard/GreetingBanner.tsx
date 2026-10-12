import { useTranslation } from "react-i18next";

export function GreetingBanner() {
  const { t } = useTranslation("dashboard");

  return (
    <div className="flex flex-col gap-1 pb-1">
      <h1 className="text-2xl leading-8 sm:text-[1.75rem] sm:leading-9 font-semibold tracking-tight text-ink">
        {t("title")}
      </h1>
      <p className="text-xs text-muted">
        {t("welcomeSubtitle")}
      </p>
    </div>
  );
}

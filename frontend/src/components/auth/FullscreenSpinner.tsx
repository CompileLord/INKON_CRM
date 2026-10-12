import { useTranslation } from "react-i18next";
import { BrandActivityIndicator } from "../ui/BrandActivityIndicator";

export function FullscreenSpinner() {
  const { t } = useTranslation("common");

  return (
    <div
      className="flex min-h-screen items-center justify-center bg-cream p-4"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex flex-col items-center gap-4 text-center">
        <BrandActivityIndicator size={48} aria-hidden="true" />
        <span className="text-sm font-medium text-muted">{t("loading")}</span>
      </div>
    </div>
  );
}

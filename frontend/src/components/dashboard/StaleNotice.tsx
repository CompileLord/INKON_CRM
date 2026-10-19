import { useTranslation } from "react-i18next";
import { Button } from "../ui/Button";

interface StaleNoticeProps {
  onRetry: () => void;
}

export function StaleNotice({ onRetry }: StaleNoticeProps) {
  const { t } = useTranslation(["dashboard", "common"]);
  return (
    <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
      <span>{t("dashboard:staleFailedNotice")}</span>
      <Button type="button" variant="secondary" onClick={onRetry}>{t("common:retry")}</Button>
    </div>
  );
}

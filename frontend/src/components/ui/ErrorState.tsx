import { useTranslation } from "react-i18next";
import { Button } from "./Button";

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({ title, message, onRetry }: ErrorStateProps) {
  const { t } = useTranslation("ui");
  return (
    <div role="alert" data-error-state className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      <p className="text-base font-medium text-ink">{title ?? t("error.title")}</p>
      <p className="max-w-md text-sm text-muted">{message ?? t("error.message")}</p>
      {onRetry !== undefined && (
        <Button type="button" variant="secondary" className="mt-2" onClick={onRetry}>
          {t("retry")}
        </Button>
      )}
    </div>
  );
}

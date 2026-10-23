import { useState } from "react";
import { WifiOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/Button";
import { retryAuthBootstrap } from "../../lib/authBootstrap";

export function AuthUnavailable() {
  const { t } = useTranslation(["auth", "common"]);
  const [retrying, setRetrying] = useState<boolean>(false);

  const retry = async (): Promise<void> => {
    setRetrying(true);
    try {
      await retryAuthBootstrap();
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-cream p-4">
      <div role="alert" className="flex w-full max-w-sm flex-col items-center gap-3 rounded-[14px] border border-border bg-card p-6 text-center motion-safe:animate-[card-scale-in_200ms_ease-out]">
        <WifiOff size={28} aria-hidden="true" className="text-muted" />
        <h1 className="text-lg font-semibold text-ink">{t("auth:serverUnreachableTitle")}</h1>
        <p className="text-sm text-muted">{t("auth:serverUnreachableHint")}</p>
        <Button type="button" variant="primary" loading={retrying} onClick={() => void retry()} className="mt-1 w-full">
          {t("common:retry")}
        </Button>
      </div>
    </div>
  );
}

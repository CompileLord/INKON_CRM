import { useTranslation } from "react-i18next";
import { Button } from "../ui/Button";

export function SettingsSectionSkeleton({ rows = 4 }: { rows?: number }) {
  const { t } = useTranslation("common");
  return (
    <div aria-busy="true" aria-label={t("loading")} className="@container divide-y divide-border rounded-[14px] border border-border bg-card px-4 sm:px-6">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="grid gap-3 py-4 @[34rem]:grid-cols-[minmax(10rem,1fr)_minmax(0,20rem)] @[34rem]:items-center @[34rem]:gap-6 @[48rem]:grid-cols-[minmax(10rem,1fr)_minmax(0,24rem)]">
          <div className="space-y-2">
            <div className="h-4 w-32 rounded bg-strip motion-safe:animate-pulse" />
            <div className="h-3 w-48 max-w-full rounded bg-strip motion-safe:animate-pulse" />
          </div>
          <div className="h-11 rounded-[10px] bg-strip motion-safe:animate-pulse" />
        </div>
      ))}
    </div>
  );
}

export function SettingsSectionError({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation("settings");
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-border bg-card px-4 py-4 sm:px-6">
      <p className="text-sm text-destructive">{t("loadFailed")}</p>
      <Button type="button" variant="secondary" onClick={onRetry}>{t("retry")}</Button>
    </div>
  );
}

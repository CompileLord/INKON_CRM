import { useTranslation } from "react-i18next";
import { Button } from "../ui/Button";

interface SettingsSaveBarProps {
  visible: boolean;
  saving: boolean;
  errorText: string | null;
  onDiscard: () => void;
  onSave: () => void;
}

export function SettingsSaveBar({ visible, saving, errorText, onDiscard, onSave }: SettingsSaveBarProps) {
  const { t } = useTranslation("settings");
  if (!visible) return null;
  return (
    <div
      role="region"
      aria-label={t("saveBar.label")}
      data-testid="settings-save-bar"
      className="sticky bottom-[calc(var(--bottom-navigation-height,64px)+12px)] z-20 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-border-warm bg-card px-4 py-3 shadow-lg motion-safe:animate-[card-scale-in_200ms_ease-out] lg:bottom-4"
    >
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-sm font-medium text-ink">
          <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-warning" />
          {t("saveBar.unsaved")}
        </p>
        {errorText && <p role="alert" className="mt-0.5 text-sm text-destructive">{errorText}</p>}
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="secondary" disabled={saving} onClick={onDiscard}>{t("saveBar.discard")}</Button>
        <Button type="button" loading={saving} onClick={onSave}>{t("saveBar.save")}</Button>
      </div>
    </div>
  );
}

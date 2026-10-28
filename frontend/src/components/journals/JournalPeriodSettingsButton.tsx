import React from "react";
import { useTranslation } from "react-i18next";
import { SlidersHorizontal } from "lucide-react";
import { Tooltip } from "../ui/Tooltip";

interface JournalPeriodSettingsButtonProps {
  onOpenSettings: () => void;
}

export const JournalPeriodSettingsButton: React.FC<JournalPeriodSettingsButtonProps> = ({ onOpenSettings }) => {
  const { t } = useTranslation("journals");
  const label: string = t("workspace.periodSettings");
  return (
    <span data-period-menu="" className="inline-flex">
      <Tooltip content={label}>
        <button
          type="button"
          aria-label={label}
          onClick={onOpenSettings}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-[10px] text-muted hover:bg-strip hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-[background-color,color,transform] motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.96]"
        >
          <SlidersHorizontal size={18} aria-hidden="true" />
        </button>
      </Tooltip>
    </span>
  );
};

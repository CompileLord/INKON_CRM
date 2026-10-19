import React, { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { MoreHorizontal, Settings } from "lucide-react";
import { JournalAnchoredOverlay } from "./JournalAnchoredOverlay";

interface JournalPeriodMenuProps {
  onOpenSettings: () => void;
}

export const JournalPeriodMenu: React.FC<JournalPeriodMenuProps> = ({ onOpenSettings }) => {
  const { t } = useTranslation("journals");
  const [open, setOpen] = useState<boolean>(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        data-period-menu=""
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("workspace.periodMenuLabel")}
        title={t("workspace.periodMenuLabel")}
        onClick={() => setOpen((previous) => !previous)}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-control-border bg-card text-muted hover:bg-row-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:h-11 pointer-coarse:w-11 motion-safe:transition-[background-color,transform] motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.96]"
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </button>
      {open && (
        <JournalAnchoredOverlay
          anchorRef={triggerRef}
          width={208}
          role="menu"
          ariaLabel={t("workspace.periodMenuLabel")}
          initialFocusRef={itemRef}
          className="p-1"
          onClose={(reason) => {
            setOpen(false);
            if (reason !== "outside") triggerRef.current?.focus();
          }}
        >
          <button
            ref={itemRef}
            type="button"
            role="menuitem"
            data-period-settings=""
            onClick={() => {
              setOpen(false);
              onOpenSettings();
            }}
            className="flex min-h-9 w-full items-center gap-2 rounded-[10px] px-3 text-left text-sm text-ink hover:bg-row-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11"
          >
            <Settings className="h-4 w-4" aria-hidden="true" />
            {t("workspace.periodSettings")}
          </button>
        </JournalAnchoredOverlay>
      )}
    </>
  );
};

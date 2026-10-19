import React, { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { MoreHorizontal } from "lucide-react";
import { JournalAnchoredOverlay } from "./JournalAnchoredOverlay";
import type { JournalBulkFillKind } from "../../lib/journals/JournalBulkFill";

interface JournalLessonColumnMenuProps {
  formattedDate: string;
  onFill: (kind: JournalBulkFillKind) => void;
}

const BULK_ACTIONS: readonly JournalBulkFillKind[] = ["markPresent", "fillHomework"];

export const JournalLessonColumnMenu: React.FC<JournalLessonColumnMenuProps> = ({ formattedDate, onFill }) => {
  const { t } = useTranslation("journals");
  const [open, setOpen] = useState<boolean>(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstItemRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        data-control="column-menu"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("bulk.menuLabel", { date: formattedDate })}
        onClick={() => setOpen((previous) => !previous)}
        className="absolute right-0.5 top-0.5 flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-row-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:h-11 pointer-coarse:w-11 motion-safe:transition-[background-color,transform] motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.96]"
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </button>
      {open && (
        <JournalAnchoredOverlay
          anchorRef={triggerRef}
          width={224}
          role="menu"
          ariaLabel={t("bulk.menuLabel", { date: formattedDate })}
          initialFocusRef={firstItemRef}
          className="p-1"
          onClose={(reason) => {
            setOpen(false);
            if (reason !== "outside") triggerRef.current?.focus();
          }}
        >
          {BULK_ACTIONS.map((action, index) => (
            <button
              key={action}
              ref={index === 0 ? firstItemRef : undefined}
              type="button"
              role="menuitem"
              onClick={() => {
                onFill(action);
                setOpen(false);
                triggerRef.current?.focus();
              }}
              className="flex min-h-9 w-full items-center rounded-[10px] px-3 text-left text-sm text-ink hover:bg-row-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11"
            >
              {t(`bulk.${action}`)}
            </button>
          ))}
        </JournalAnchoredOverlay>
      )}
    </>
  );
};

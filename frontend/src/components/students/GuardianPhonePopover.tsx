import { Popover } from "@base-ui/react/popover";
import { UsersRound } from "lucide-react";
import { useTranslation } from "react-i18next";

interface GuardianPhonePopoverProps {
  guardianPhone: string;
}

export function GuardianPhonePopover({ guardianPhone }: GuardianPhonePopoverProps) {
  const { t } = useTranslation("students");
  const label: string = t("table.guardianPhone");

  return (
    <Popover.Root>
      <Popover.Trigger
        openOnHover
        delay={200}
        aria-label={label}
        onClick={(event) => event.stopPropagation()}
        className="-mx-2 inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-[10px] text-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-[color,transform] motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.96]"
      >
        <UsersRound size={16} aria-hidden="true" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="center" sideOffset={4} collisionPadding={8} className="z-70">
          <Popover.Popup
            onClick={(event) => event.stopPropagation()}
            className="origin-[var(--transform-origin)] rounded-[10px] border border-border-warm bg-card px-3 py-2 text-sm text-ink shadow-lg transition-opacity duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] focus-visible:outline-none motion-safe:transition-[opacity,transform] data-[starting-style]:opacity-0 motion-safe:data-[starting-style]:scale-[0.96] data-[ending-style]:opacity-0 motion-safe:data-[ending-style]:scale-[0.96]"
          >
            <div className="text-xs text-label">{label}</div>
            <a
              href={`tel:${guardianPhone}`}
              className="inline-flex min-h-11 items-center font-medium tabular-nums text-ink hover:text-maroon focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
            >
              {guardianPhone}
            </a>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

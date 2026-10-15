import { useState } from "react";
import { Popover } from "@base-ui/react/popover";
import { Eye, EyeOff, Key } from "lucide-react";
import { useTranslation } from "react-i18next";

interface StudentAccountAccessPopoverProps {
  rawPassword: string | null | undefined;
}

export function StudentAccountAccessPopover({ rawPassword }: StudentAccountAccessPopoverProps) {
  const { t } = useTranslation("students");
  const [isPasswordVisible, setIsPasswordVisible] = useState<boolean>(false);

  return (
    <Popover.Root onOpenChange={() => setIsPasswordVisible(false)}>
      <Popover.Trigger
        aria-label={t("accountAccess")}
        title={t("accountAccess")}
        className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-[10px] text-muted hover:bg-strip hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-[background-color,color,transform] motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.96]"
      >
        <Key size={18} aria-hidden="true" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={6} collisionPadding={16} className="z-70">
          <Popover.Popup className="w-[min(20rem,calc(100vw-32px))] origin-[var(--transform-origin)] rounded-2xl border border-border-warm bg-card p-3 text-sm shadow-lg transition-opacity duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] focus-visible:outline-none motion-safe:transition-[opacity,transform] data-[starting-style]:opacity-0 motion-safe:data-[starting-style]:scale-[0.96] data-[ending-style]:opacity-0 motion-safe:data-[ending-style]:scale-[0.96]">
            <Popover.Title className="text-xs font-semibold text-label">{t("accountAccess")}</Popover.Title>
            <div className="mt-1 flex items-center gap-2">
              {rawPassword ? (
                <>
                  <span className="text-muted">{t("passwordLabel")}:</span>
                  <span className="font-mono font-bold tracking-wider text-ink [overflow-wrap:anywhere]">
                    {isPasswordVisible ? rawPassword : "••••••••"}
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsPasswordVisible((visible) => !visible)}
                    className="ml-auto inline-flex min-h-11 min-w-11 items-center justify-center rounded-[10px] text-nav hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out"
                    aria-label={isPasswordVisible ? t("hidePassword") : t("showPassword")}
                  >
                    {isPasswordVisible ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </>
              ) : (
                <span className="py-2 text-muted">{t("credentialsUnavailable")}</span>
              )}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

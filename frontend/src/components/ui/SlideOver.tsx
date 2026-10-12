import { useEffect, type ComponentProps, type ReactNode } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useShellStore } from "../../store/shellStore";

export type SlideOverVariant = "person" | "course";

export interface SlideOverProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  variant?: SlideOverVariant;
  closeDisabled?: boolean;
  pending?: boolean;
  initialFocus?: ComponentProps<typeof Dialog.Popup>["initialFocus"];
  finalFocus?: ComponentProps<typeof Dialog.Popup>["finalFocus"];
}

export function SlideOver({
  open,
  onClose,
  title,
  children,
  footer,
  variant = "person",
  closeDisabled = false,
  pending = false,
  initialFocus,
  finalFocus,
}: SlideOverProps) {
  const { t } = useTranslation("common");
  const closeShell = useShellStore((state) => state.close);
  const isDismissBlocked = closeDisabled || pending;
  const isCourseVariant = variant === "course";

  useEffect(() => {
    if (open) {
      closeShell();
    }
  }, [open, closeShell]);

  const desktopDrawerClasses = isCourseVariant
    ? "md:inset-y-0 md:left-auto md:right-0 md:w-[560px] md:max-w-[560px] md:rounded-l-2xl md:border-l md:border-border-warm origin-bottom md:origin-right"
    : "sm:inset-y-0 sm:left-auto sm:right-0 sm:w-[480px] sm:max-w-[480px] sm:rounded-l-2xl sm:border-l sm:border-border-warm origin-bottom sm:origin-right";

  const headerDesktopPadding = isCourseVariant ? "md:pt-4" : "sm:pt-4";
  const bodyDesktopPadding = isCourseVariant ? "md:pb-5" : "sm:pb-5";
  const footerDesktopPadding = isCourseVariant ? "md:pb-4" : "sm:pb-4";

  return (
    <Dialog.Root
      open={open}
      disablePointerDismissal={isDismissBlocked}
      onOpenChange={(next) => {
        if (!next && !isDismissBlocked) {
          onClose();
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-60 bg-scrim" />
        <Dialog.Popup
          initialFocus={initialFocus}
          finalFocus={finalFocus}
          className={`fixed inset-0 z-70 grid w-full h-dvh max-h-dvh ${
            footer
              ? "grid-rows-[auto_minmax(0,1fr)_auto]"
              : "grid-rows-[auto_minmax(0,1fr)]"
          } overflow-hidden bg-card shadow-2xl motion-safe:animate-[card-scale-in_200ms_ease-out] has-focus-visible:animate-none ${desktopDrawerClasses}`}
        >
          <div
            className={`flex shrink-0 items-center justify-between gap-3 border-b border-border-warm px-6 py-4 pt-[calc(1rem+env(safe-area-inset-top,0px))] ${headerDesktopPadding}`}
          >
            <Dialog.Title className="text-lg font-bold text-ink">
              {title}
            </Dialog.Title>
            <Dialog.Close
              disabled={isDismissBlocked}
              aria-label={t("close")}
              className="flex h-11 w-11 min-h-11 min-w-11 shrink-0 items-center justify-center rounded-[10px] text-muted hover:text-ink hover:bg-strip motion-safe:transition-[color,background-color,transform] motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 disabled:active:scale-100"
            >
              <X size={20} />
            </Dialog.Close>
          </div>

          <div
            className={`min-h-0 overflow-y-auto overscroll-contain px-6 py-5 ${
              !footer
                ? `pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] ${bodyDesktopPadding}`
                : ""
            }`}
          >
            {children}
          </div>

          {footer && (
            <div
              className={`shrink-0 border-t border-border-warm px-6 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] ${footerDesktopPadding}`}
            >
              {footer}
            </div>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

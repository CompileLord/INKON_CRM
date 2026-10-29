import { useEffect, type ComponentProps, type ReactNode } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useShellStore } from "../../store/shellStore";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  maxWidthClassName?: string;
  footer?: ReactNode;
  fullScreenOnMobile?: boolean;
  initialFocus?: ComponentProps<typeof Dialog.Popup>["initialFocus"];
  finalFocus?: ComponentProps<typeof Dialog.Popup>["finalFocus"];
  closeDisabled?: boolean;
  onOpenChangeComplete?: (open: boolean) => void;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  maxWidthClassName = "max-w-md",
  footer,
  fullScreenOnMobile = false,
  initialFocus,
  finalFocus,
  closeDisabled = false,
  onOpenChangeComplete,
}: ModalProps) {
  const { t } = useTranslation("common");
  const closeShell = useShellStore((state) => state.close);

  useEffect(() => {
    if (open) closeShell();
  }, [open, closeShell]);

  return (
    <Dialog.Root
      open={open}
      disablePointerDismissal={closeDisabled}
      onOpenChangeComplete={onOpenChangeComplete}
      onOpenChange={(next) => {
        if (!next) {
          if (!closeDisabled) {
            onClose();
          }
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-60 bg-scrim motion-safe:transition-opacity motion-safe:duration-200 motion-safe:ease-out data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 data-[ending-style]:motion-safe:duration-150" />
        <Dialog.Viewport
          className={`fixed inset-0 z-70 flex items-center justify-center ${fullScreenOnMobile ? "p-0 sm:p-6" : "p-4"}`}
        >
          <Dialog.Popup
            initialFocus={initialFocus}
            finalFocus={finalFocus}
            className={`relative flex w-full ${maxWidthClassName} flex-col overflow-hidden bg-card shadow-xl motion-safe:transition-[opacity,transform] motion-safe:duration-200 motion-safe:ease-out data-[starting-style]:opacity-0 data-[starting-style]:scale-[0.96] data-[ending-style]:opacity-0 data-[ending-style]:scale-[0.96] data-[ending-style]:motion-safe:duration-150 ${fullScreenOnMobile ? "h-dvh max-h-dvh rounded-none pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] sm:h-auto sm:max-h-[calc(100dvh-48px)] sm:rounded-2xl" : "max-h-[calc(100dvh-32px-env(safe-area-inset-top)-env(safe-area-inset-bottom))] rounded-2xl"}`}
          >
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border-warm px-5 py-2">
              <Dialog.Title className="text-lg font-semibold text-ink">{title}</Dialog.Title>
              <Dialog.Close
                disabled={closeDisabled}
                aria-label={t("close")}
                className="flex min-h-11 min-w-11 items-center justify-center rounded-[10px] text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X size={20} />
              </Dialog.Close>
            </div>
            <div
              className={`min-h-0 flex-1 overflow-y-auto overscroll-contain ${fullScreenOnMobile ? "p-6" : "p-4"}`}
            >
              {children}
            </div>
            {footer && <div className="shrink-0 border-t border-border-warm p-4 sm:px-6">{footer}</div>}
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

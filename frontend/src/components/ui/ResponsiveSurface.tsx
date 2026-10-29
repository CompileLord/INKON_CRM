import type { ReactNode } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Popover } from "@base-ui/react/popover";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useDesktop } from "../shell/useDesktop";

interface ResponsiveSurfaceProps { id: string; title: string; trigger: HTMLElement | null; onClose: () => void; children: ReactNode }
export function ResponsiveSurface({ id, title, trigger, onClose, children }: ResponsiveSurfaceProps) {
  const { t } = useTranslation("common");
  const desktop = useDesktop();
  const returnFocus = () => trigger?.isConnected && trigger.getClientRects().length ? trigger : document.querySelector<HTMLElement>("[data-shell-settings]") ?? document.getElementById("main-content");
  const popupClass = "[overflow-wrap:anywhere] flex max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-32px)] flex-col overflow-hidden rounded-2xl border border-border bg-card text-ink shadow-xl motion-safe:transition-[opacity,transform] motion-safe:duration-200 motion-safe:ease-out data-[starting-style]:opacity-0 data-[starting-style]:scale-[0.96] data-[ending-style]:opacity-0 data-[ending-style]:scale-[0.96]";
  const closeClass = "flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-[10px] text-muted focus-visible:ring-2 focus-visible:ring-ring";
  if (!desktop) return <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}><Dialog.Portal><Dialog.Backdrop className="fixed inset-0 z-60 bg-scrim motion-safe:transition-opacity motion-safe:duration-200 motion-safe:ease-out data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 data-[ending-style]:motion-safe:duration-150"/><Dialog.Popup id={id} finalFocus={returnFocus} className={`${popupClass} fixed bottom-[calc(16px+env(safe-area-inset-bottom))] left-1/2 z-70 w-[min(360px,calc(100%-32px))] -translate-x-1/2 origin-bottom`}><div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2"><Dialog.Title className="min-w-0 text-lg font-semibold">{title}</Dialog.Title><Dialog.Close aria-label={t("close")} className={closeClass}><X size={20}/></Dialog.Close></div><div className="min-h-0 overflow-y-auto overscroll-contain p-4">{children}</div></Dialog.Popup></Dialog.Portal></Dialog.Root>;
  return <Popover.Root open modal={false} onOpenChange={(open) => { if (!open) onClose(); }}><Popover.Portal><Popover.Positioner anchor={trigger} side="bottom" align="end" sideOffset={8} collisionPadding={16} className="z-70"><Popover.Popup id={id} finalFocus={returnFocus} className={`${popupClass} max-h-[min(var(--available-height),calc(100dvh-32px))] w-[min(360px,calc(100vw-32px))] origin-[var(--transform-origin)]`}><div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2"><Popover.Title className="min-w-0 text-lg font-semibold">{title}</Popover.Title><Popover.Close aria-label={t("close")} className={closeClass}><X size={20}/></Popover.Close></div><div className="min-h-0 overflow-y-auto overscroll-contain p-4">{children}</div></Popover.Popup></Popover.Positioner></Popover.Portal></Popover.Root>;
}

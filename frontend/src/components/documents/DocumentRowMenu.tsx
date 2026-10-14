import { useRef } from "react";
import { Menu } from "@base-ui/react/menu";
import { MoreVertical, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { DocumentItem } from "../../lib/documents/types";

interface DocumentRowMenuProps {
  document: DocumentItem;
  onDelete: (document: DocumentItem, trigger: HTMLElement | null) => void;
}

export function DocumentRowMenu({ document, onDelete }: DocumentRowMenuProps) {
  const { t } = useTranslation(["documents", "common"]);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  return (
    <Menu.Root>
      <Menu.Trigger
        ref={triggerRef}
        type="button"
        aria-label={t("rowActions", { filename: document.file_name })}
        className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-[10px] text-muted motion-safe:transition-[background-color,color,transform] motion-safe:duration-150 motion-safe:ease-out hover:bg-strip hover:text-ink motion-safe:active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <MoreVertical size={18} />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side="bottom" align="end" sideOffset={6} className="z-50">
          <Menu.Popup className="min-w-44 overflow-hidden rounded-xl border border-border bg-card p-1 text-ink shadow-lg motion-safe:animate-[card-scale-in_200ms_ease-out] origin-[var(--transform-origin)]">
            <Menu.Item
              className="flex min-h-[44px] w-full cursor-pointer select-none items-center gap-2.5 px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 focus:bg-destructive/10 focus-visible:outline-none motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out"
              onClick={() => onDelete(document, triggerRef.current)}
            >
              <Trash2 size={15} className="shrink-0" />
              <span>{t("common:delete")}</span>
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

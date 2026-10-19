import { Menu as BaseMenu } from "@base-ui/react/menu";
import { MoreHorizontal } from "lucide-react";
import { useTranslation } from "react-i18next";

export interface MenuItem {
  key: string;
  label: string;
  onSelect: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

interface MenuProps {
  items: readonly MenuItem[];
  label?: string;
  align?: "start" | "end";
}

export function Menu({ items, label, align = "end" }: MenuProps) {
  const { t } = useTranslation("ui");
  return (
    <BaseMenu.Root>
      <BaseMenu.Trigger
        aria-label={label ?? t("menu.actions")}
        className="relative z-10 inline-flex min-h-11 min-w-11 items-center justify-center rounded-[10px] text-muted hover:bg-strip hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-[background-color,color,transform] motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.96]"
      >
        <MoreHorizontal size={18} aria-hidden="true" />
      </BaseMenu.Trigger>
      <BaseMenu.Portal>
        <BaseMenu.Positioner side="bottom" align={align} sideOffset={6} collisionPadding={16} className="z-70">
          <BaseMenu.Popup className="min-w-48 origin-[var(--transform-origin)] rounded-2xl border border-border-warm bg-card p-1 shadow-lg focus-visible:outline-none motion-safe:transition-[opacity,transform] motion-safe:duration-150 motion-safe:ease-[cubic-bezier(0.16,1,0.3,1)] data-[starting-style]:opacity-0 motion-safe:data-[starting-style]:scale-[0.96] data-[ending-style]:opacity-0">
            {items.map((item) => (
              <BaseMenu.Item
                key={item.key}
                disabled={item.disabled}
                onClick={item.onSelect}
                className={`flex min-h-11 cursor-pointer items-center rounded-[10px] px-3 text-sm outline-none data-[highlighted]:bg-row-hover data-[disabled]:cursor-not-allowed data-[disabled]:text-muted ${item.destructive ? "text-destructive" : "text-ink"}`}
              >
                {item.label}
              </BaseMenu.Item>
            ))}
          </BaseMenu.Popup>
        </BaseMenu.Positioner>
      </BaseMenu.Portal>
    </BaseMenu.Root>
  );
}

import { useState } from "react";
import { Search, Bell } from "lucide-react";
import { useTranslation } from "react-i18next";
import { NotificationPopover } from "./notifications/NotificationPopover";
import { QuickSettingsChanger } from "./ui/QuickSettingsChanger";
import { useUnreadNotificationCount } from "../lib/notifications/hooks";

export function Header() {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const { t } = useTranslation("common");
  const { data: unreadData } = useUnreadNotificationCount();
  const unreadCount = unreadData?.unread_count ?? 0;

  return (
    <header className="border-b border-border bg-cream px-4 py-4 md:px-8 transition-colors duration-150">
      <div className="flex items-center justify-between gap-4">
        {/* Search Input */}
        <div className="relative w-full max-w-120 mx-auto">
          <Search
            size={18}
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            type="text"
            placeholder={t("search")}
            className="w-full rounded-full border border-border bg-card py-2.5 pl-11 pr-4 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/30 transition-colors"
          />
        </div>

        {/* Header Right Actions */}
        <div className="relative flex items-center gap-3">
          <QuickSettingsChanger />

          <button
            onClick={() => setIsPopoverOpen(!isPopoverOpen)}
            className="relative rounded-full border border-border bg-card p-2.5 text-muted hover:bg-cream hover:text-ink active:scale-95 transition-[background-color,transform,color,border-color] duration-150 ease-out shadow-xs"
            title={t("nav.notifications")}
          >
            <Bell size={18} />
            {unreadCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-maroon text-[10px] font-bold text-white tabular-nums">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </button>

          <NotificationPopover
            isOpen={isPopoverOpen}
            onClose={() => setIsPopoverOpen(false)}
          />
        </div>
      </div>
    </header>
  );
}

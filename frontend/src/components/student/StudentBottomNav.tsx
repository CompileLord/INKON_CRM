import { NavLink } from "react-router-dom";
import { LayoutDashboard, BookOpen, Bell, Settings } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../store/authStore";
import { useUnreadNotificationCount } from "../../lib/notifications/hooks";

export function StudentBottomNav() {
  const { t } = useTranslation("common");
  const role = useAuthStore((s) => s.role);
  const { data: unreadData } = useUnreadNotificationCount();
  const unreadCount = unreadData?.unread_count ?? 0;

  if (role !== "student") return null;

  const items = [
    { to: "/", label: t("nav.dashboard", "Главная"), icon: LayoutDashboard, end: true },
    { to: "/my/courses", label: t("nav.myCourses", "Мои курсы"), icon: BookOpen },
    { to: "/notifications", label: t("nav.notifications", "Уведомления"), icon: Bell, badge: unreadCount },
    { to: "/settings", label: t("nav.settings", "Настройки"), icon: Settings },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around border-t border-border bg-card pb-[env(safe-area-inset-bottom)] pt-2 md:hidden shadow-lg">
      {items.map(({ to, label, icon: Icon, end, badge }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            [
              "relative flex flex-col items-center gap-1 px-3 py-1 text-center transition-colors duration-150 active:scale-95",
              isActive ? "text-maroon dark:text-accent font-semibold" : "text-muted hover:text-ink",
            ].join(" ")
          }
        >
          <div className="relative">
            <Icon size={22} strokeWidth={1.8} />
            {!!badge && badge > 0 && (
              <span className="absolute -right-1.5 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-maroon text-[9px] font-bold text-white tabular-nums">
                {badge > 99 ? "99+" : badge}
              </span>
            )}
          </div>
          <span className="text-[10px] leading-none">{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

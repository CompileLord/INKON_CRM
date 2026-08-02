import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  LayoutDashboard,
  Users,
  GraduationCap,
  BookOpen,
  ClipboardList,
  Wallet,
  BarChart3,
  Settings,
  LogOut,
  type LucideIcon,
} from "lucide-react";
import { useLogout } from "../lib/useLogout";
import { useAuthStore } from "../store/authStore";
import { NAV_ACCESS, type NavKey } from "../lib/auth/roleAccess";

interface NavItemDef {
  navKey: NavKey;
  key: string;
  to: string;
  icon: LucideIcon;
}

const navItemDefs: NavItemDef[] = [
  { navKey: "dashboard", key: "nav.dashboard", to: "/", icon: LayoutDashboard },
  { navKey: "students", key: "nav.students", to: "/students", icon: Users },
  { navKey: "mentors", key: "nav.mentors", to: "/mentors", icon: GraduationCap },
  { navKey: "courses", key: "nav.courses", to: "/courses", icon: BookOpen },
  { navKey: "journals", key: "nav.journals", to: "/journals", icon: ClipboardList },
  { navKey: "finance", key: "nav.finance", to: "/finance", icon: Wallet },
  { navKey: "audit", key: "nav.audit", to: "/audit", icon: BarChart3 },
  { navKey: "settings", key: "nav.settings", to: "/settings", icon: Settings },
];

export function Sidebar() {
  const logout = useLogout();
  const { t } = useTranslation("common");
  const role = useAuthStore((s) => s.role);

  const allowedKeys = role ? NAV_ACCESS[role] : [];
  const visibleNavItems = navItemDefs.filter((item) => allowedKeys.includes(item.navKey));

  return (
    <aside className="sticky top-0 flex h-screen w-16 shrink-0 flex-col border-r border-border bg-card md:w-64">
      <div className="px-5 pb-4 pt-6">
        <h1 className="hidden text-2xl font-bold leading-none tracking-[-0.5px] text-maroon md:block">
          ИМКОН
        </h1>
        <span className="mt-0.5 hidden text-[11px] uppercase tracking-[2px] text-label md:block">
          CRM
        </span>
        <div className="text-center text-lg font-bold text-maroon md:hidden">
          И
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
        {visibleNavItems.map(({ key, to, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              [
                "flex items-center gap-3 rounded-[10px] px-3 py-3 text-base transition-colors duration-150",
                isActive
                  ? "bg-beige font-semibold text-ink"
                  : "font-medium text-nav hover:bg-nav-hover",
              ].join(" ")
            }
          >
            {({ isActive }) => (
              <>
                <Icon
                  size={22}
                  strokeWidth={1.8}
                  className={isActive ? "shrink-0 text-maroon dark:text-accent font-bold" : "shrink-0 text-muted"}
                />
                <span className="hidden md:inline">{t(key)}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-border p-3">
        <button
          type="button"
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-[10px] px-3 py-3 text-base font-medium text-nav transition-colors duration-150 hover:bg-nav-hover"
        >
          <LogOut size={22} strokeWidth={1.8} className="shrink-0 text-muted" />
          <span className="hidden md:inline">{t("nav.logout")}</span>
        </button>
      </div>
    </aside>
  );
}

import { useState, useEffect } from "react";
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
  ChevronLeft,
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

const SIDEBAR_STORAGE_KEY = "imkon-sidebar-collapsed";

function getInitialCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true";
}

export function Sidebar() {
  const logout = useLogout();
  const { t } = useTranslation("common");
  const role = useAuthStore((s) => s.role);
  const [isCollapsed, setIsCollapsed] = useState<boolean>(getInitialCollapsed);

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(isCollapsed));
  }, [isCollapsed]);

  const allowedKeys = role ? NAV_ACCESS[role] : [];
  const visibleNavItems = navItemDefs.filter((item) => allowedKeys.includes(item.navKey));

  const handleSidebarClick = () => {
    if (isCollapsed) {
      setIsCollapsed(false);
    }
  };

  return (
    <aside
      onClick={handleSidebarClick}
      className={[
        "relative sticky top-0 z-30 flex h-screen shrink-0 flex-col border-r border-border bg-card transition-[width] duration-300 ease-[cubic-bezier(0.2,0,0,1)] select-none",
        isCollapsed ? "w-16 md:w-20 cursor-pointer" : "w-16 md:w-64",
      ].join(" ")}
      title={isCollapsed ? t("sidebar.clickToExpand", "Нажмите, чтобы развернуть меню") : undefined}
    >
      {/* Floating Edge M3 Toggle Button */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIsCollapsed((prev) => !prev);
        }}
        title={isCollapsed ? t("sidebar.expand", "Развернуть меню") : t("sidebar.collapse", "Свернуть меню")}
        aria-label={isCollapsed ? t("sidebar.expand", "Развернуть меню") : t("sidebar.collapse", "Свернуть меню")}
        className="hidden md:flex absolute -right-3.5 top-6 z-40 h-7 w-7 items-center justify-center rounded-full border border-border-warm bg-card text-muted shadow-md hover:bg-beige hover:text-ink hover:scale-110 active:scale-95 transition-all duration-300 ease-[cubic-bezier(0.2,0,0,1)] ring-1 ring-black/5 dark:ring-white/10"
      >
        <ChevronLeft
          size={16}
          className={[
            "transition-transform duration-300 ease-[cubic-bezier(0.2,0,0,1)]",
            isCollapsed ? "rotate-180 text-maroon dark:text-accent" : "",
          ].join(" ")}
        />
      </button>

      {/* Header Logo & Title */}
      <div
        className={[
          "flex items-center pb-4 pt-5 transition-all duration-300 ease-[cubic-bezier(0.2,0,0,1)]",
          isCollapsed ? "justify-center px-0" : "px-5 gap-3",
        ].join(" ")}
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-maroon text-lg font-bold text-white shadow-xs dark:bg-accent ring-1 ring-black/5 dark:ring-white/10 transition-transform duration-200 hover:scale-105">
          И
        </div>
        <div
          className={[
            "flex flex-col overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.2,0,0,1)]",
            isCollapsed ? "max-w-0 opacity-0 pointer-events-none" : "max-w-[140px] opacity-100 hidden md:flex",
          ].join(" ")}
        >
          <h1 className="text-xl font-bold leading-none tracking-[-0.5px] text-maroon dark:text-accent">
            ИМКОН
          </h1>
          <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-[2px] text-label">
            CRM
          </span>
        </div>
      </div>

      {/* Nav Items */}
      <nav className="flex flex-1 flex-col gap-1.5 overflow-y-auto px-2.5 py-3">
        {visibleNavItems.map(({ key, to, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            title={isCollapsed ? t(key) : undefined}
            onClick={() => {
              if (isCollapsed) {
                // Expanding on click
                setIsCollapsed(false);
              }
            }}
            className={({ isActive }) =>
              [
                "group relative flex items-center gap-3 rounded-xl px-3 py-3 text-base transition-all duration-200 ease-[cubic-bezier(0.2,0,0,1)] active:scale-[0.98]",
                isActive
                  ? "bg-beige font-semibold text-ink shadow-xs"
                  : "font-medium text-nav hover:bg-nav-hover hover:text-ink",
                isCollapsed ? "justify-center px-0 md:px-0" : "",
              ].join(" ")
            }
          >
            {({ isActive }) => (
              <>
                <Icon
                  size={22}
                  strokeWidth={1.8}
                  className={[
                    "shrink-0 transition-transform duration-200 group-hover:scale-110",
                    isActive ? "text-maroon dark:text-accent font-bold" : "text-muted",
                  ].join(" ")}
                />
                <span
                  className={[
                    "overflow-hidden whitespace-nowrap text-sm transition-all duration-300 ease-[cubic-bezier(0.2,0,0,1)]",
                    isCollapsed ? "max-w-0 opacity-0 pointer-events-none" : "max-w-[160px] opacity-100 hidden md:inline",
                  ].join(" ")}
                >
                  {t(key)}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Footer / Logout */}
      <div className="border-t border-border p-2.5">
        <button
          type="button"
          onClick={(e) => {
            if (isCollapsed) {
              e.stopPropagation();
              setIsCollapsed(false);
              return;
            }
            logout();
          }}
          title={isCollapsed ? t("nav.logout") : undefined}
          className={[
            "group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-base font-medium text-nav transition-all duration-200 ease-[cubic-bezier(0.2,0,0,1)] active:scale-[0.98] hover:bg-nav-hover hover:text-ink",
            isCollapsed ? "justify-center px-0 md:px-0" : "",
          ].join(" ")}
        >
          <LogOut size={22} strokeWidth={1.8} className="shrink-0 text-muted transition-transform duration-200 group-hover:scale-110 group-hover:text-rose-600" />
          <span
            className={[
              "overflow-hidden whitespace-nowrap text-sm transition-all duration-300 ease-[cubic-bezier(0.2,0,0,1)]",
              isCollapsed ? "max-w-0 opacity-0 pointer-events-none" : "max-w-[160px] opacity-100 hidden md:inline",
            ].join(" ")}
          >
            {t("nav.logout")}
          </span>
        </button>
      </div>
    </aside>
  );
}

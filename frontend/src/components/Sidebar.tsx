import { NavLink } from "react-router-dom";
import { LogOut } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../store/authStore";
import { useLogout } from "../lib/useLogout";
import { BrandLogo } from "./ui/BrandLogo";
import { navigationFor } from "./shell/navigation";

export function Sidebar() {
  const { t } = useTranslation("common");
  const { role, userId } = useAuthStore();
  const logout = useLogout();
  if (!role) return null;
  return <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-border bg-card px-4 lg:flex">
    <div className="py-4"><BrandLogo size="sidebar" /></div>
    <nav aria-label={t("shell.navigation")} className="min-h-0 flex-1 overflow-y-auto pb-4">
      {navigationFor(role, userId).map(({ key, to, icon: Icon }) => <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => `flex min-h-11 items-center gap-3 rounded-[10px] px-3 py-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${isActive ? "bg-beige font-semibold text-maroon" : "text-nav hover:bg-row-hover"}`}><Icon size={20} className="shrink-0" aria-hidden="true"/><span className="min-w-0 break-words">{t(key)}</span></NavLink>)}
    </nav>
    <div className="border-t border-border py-4"><button type="button" onClick={logout} className="flex min-h-11 w-full items-center gap-3 rounded-[10px] px-3 text-nav hover:bg-row-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><LogOut size={20} aria-hidden="true"/>{t("nav.logout")}</button></div>
  </aside>;
}

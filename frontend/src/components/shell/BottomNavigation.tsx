import { useLayoutEffect, useRef } from "react";
import { MoreHorizontal } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../store/authStore";
import { useShellStore } from "../../store/shellStore";
import { navigationFor, primaryNavigation, matchesDestination } from "./navigation";
import { UnreadBadge } from "../notifications/UnreadBadge";

export function BottomNavigation() {
  const { t } = useTranslation("common");
  const { role, userId } = useAuthStore();
  const { pathname } = useLocation();
  const { surface, toggle } = useShellStore();
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => document.documentElement.style.setProperty("--bottom-navigation-height", `${element.getBoundingClientRect().height}px`);
    const observer = new ResizeObserver(update);
    observer.observe(element); update();
    return () => { observer.disconnect(); document.documentElement.style.removeProperty("--bottom-navigation-height"); };
  }, []);
  if (!role) return null;
  const primary = primaryNavigation(role, userId);
  const moreActive = navigationFor(role, userId).filter((item) => !primary.some((main) => main.to === item.to)).some((item) => matchesDestination(pathname, item.to));
  return <nav ref={ref} aria-label={t("shell.navigation")} className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-border bg-card px-1 pb-[env(safe-area-inset-bottom)] lg:hidden">
    {primary.map(({ key, to, icon: Icon }) => <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => `flex min-h-16 min-w-0 flex-col items-center justify-center gap-1 rounded-[10px] px-0.5 py-2 text-center text-[11px] leading-4 min-[360px]:text-xs focus-visible:ring-2 focus-visible:ring-ring ${isActive ? "font-semibold text-maroon-text" : "text-muted"}`}><span className="flex items-center gap-1"><Icon size={20} aria-hidden="true"/>{to === "/notifications" && <UnreadBadge/>}</span><span className="max-w-full truncate">{t(key)}</span></NavLink>)}
    <button type="button" aria-expanded={surface === "more"} aria-controls={surface === "more" ? "shell-surface" : undefined} onClick={(event) => toggle("more", event.currentTarget)} className={`flex min-h-16 min-w-0 flex-col items-center justify-center gap-1 rounded-[10px] px-0.5 py-2 text-[11px] leading-4 min-[360px]:text-xs focus-visible:ring-2 focus-visible:ring-ring ${moreActive ? "font-semibold text-maroon-text" : "text-muted"}`}><MoreHorizontal size={20} aria-hidden="true"/><span className="max-w-full truncate">{t("shell.more")}</span></button>
  </nav>;
}

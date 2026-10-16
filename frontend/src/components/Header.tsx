import { Link, useLocation } from "react-router-dom";
import { ArrowLeft, Bell, Settings } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../store/authStore";
import { useShellStore } from "../store/shellStore";
import { Button } from "./ui/Button";
import { BrandLogo } from "./ui/BrandLogo";
import { UnreadBadge } from "./notifications/UnreadBadge";
import { routeContext } from "./shell/navigation";

export function Header() {
  const { t } = useTranslation("common");
  const { pathname } = useLocation();
  const { role, userId } = useAuthStore();
  const { surface, toggle } = useShellStore();
  if (!role) return null;
  const context = routeContext(pathname, role, userId);
  return <header className="sticky top-0 z-30 border-b border-border bg-cream [overflow-wrap:anywhere] px-4 pt-[env(safe-area-inset-top)] lg:px-8">
    <div className="flex min-h-14 items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">{context.parent ? <Link to={context.parent.to} aria-label={t("shell.backTo", { destination: t(context.parent.key) })} className="flex min-h-11 min-w-11 items-center justify-center rounded-[10px] text-maroon focus-visible:ring-2 focus-visible:ring-ring"><ArrowLeft size={20}/></Link> : <div className="lg:hidden"><BrandLogo variant="emblem" size="sm"/></div>}<span className="min-w-0 break-words text-sm text-muted">{t(context.key)}</span></div>
      <div className="flex shrink-0 gap-2">
        <div className={role === "student" || role === "accountant" ? "hidden lg:block" : ""}><Button type="button" variant="secondary" aria-label={t("nav.notifications")} aria-expanded={surface === "notifications"} aria-controls={surface === "notifications" ? "shell-surface" : undefined} onClick={(event) => toggle("notifications", event.currentTarget)} className="px-2"><Bell size={20} aria-hidden="true"/><UnreadBadge/></Button></div>
        <Button type="button" variant="secondary" data-shell-settings aria-label={t("theme.settings")} aria-expanded={surface === "settings"} aria-controls={surface === "settings" ? "shell-surface" : undefined} onClick={(event) => toggle("settings", event.currentTarget)} className="px-3"><Settings size={20} aria-hidden="true"/></Button>
      </div>
    </div>
  </header>;
}

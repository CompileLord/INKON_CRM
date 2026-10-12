import { Link } from "react-router-dom";
import { LogOut } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useShellStore } from "../../store/shellStore";
import { useAuthStore } from "../../store/authStore";
import { useLogout } from "../../lib/useLogout";
import { QuickSettingsChanger } from "../ui/QuickSettingsChanger";
import { NotificationPopover } from "../notifications/NotificationPopover";
import { navigationFor, primaryNavigation } from "./navigation";
import { ResponsiveSurface } from "../ui/ResponsiveSurface";

export function ShellOverlay() {
  const { t } = useTranslation("common");
  const { surface, trigger, close } = useShellStore();
  const { role, userId } = useAuthStore();
  const logout = useLogout();
  if (!surface || !role) return null;
  const title = t(surface === "more" ? "shell.more" : surface === "settings" ? "nav.settings" : "shell.notifications");
  const content = surface === "settings" ? <QuickSettingsChanger/> : surface === "notifications" ? <NotificationPopover onClose={close}/> : <nav aria-label={t("shell.more")} className="space-y-1">{navigationFor(role, userId).filter((item) => !primaryNavigation(role, userId).some((primary) => primary.to === item.to)).map(({ key, to, icon: Icon }) => <Link key={to} to={to} onClick={close} className="flex min-h-11 items-center gap-3 rounded-[10px] px-3 py-3 text-nav hover:bg-row-hover focus-visible:ring-2 focus-visible:ring-ring"><Icon size={20} aria-hidden="true"/><span className="min-w-0 break-words">{t(key)}</span></Link>)}<div className="border-t border-border pt-3"><button type="button" onClick={() => { close(); logout(); }} className="flex min-h-11 w-full items-center gap-3 rounded-[10px] px-3 text-nav focus-visible:ring-2 focus-visible:ring-ring"><LogOut size={20} aria-hidden="true"/>{t("nav.logout")}</button></div></nav>;
  return <ResponsiveSurface id="shell-surface" title={title} trigger={trigger} onClose={close}>{content}</ResponsiveSurface>;
}

import { BookOpen, ClipboardList, Home, Users, GraduationCap, Wallet, ScrollText, Settings, Bell, UserRound, type LucideIcon } from "lucide-react";
import { NAV_ACCESS, type NavKey, isPathAllowed } from "../../lib/auth/roleAccess";
import type { Role } from "../../lib/users/types";

export interface NavigationItem { key: string; to: string; icon: LucideIcon }
const items: (NavigationItem & { access: NavKey })[] = [
  { access: "dashboard", key: "nav.home", to: "/", icon: Home },
  { access: "courses", key: "nav.courses", to: "/courses", icon: BookOpen },
  { access: "myCourses", key: "nav.myCourses", to: "/my/courses", icon: BookOpen },
  { access: "journals", key: "nav.journals", to: "/journals", icon: ClipboardList },
  { access: "students", key: "nav.students", to: "/students", icon: Users },
  { access: "mentors", key: "nav.mentors", to: "/mentors", icon: GraduationCap },
  { access: "finance", key: "nav.finance", to: "/finance", icon: Wallet },
  { access: "audit", key: "nav.audit", to: "/audit", icon: ScrollText },
  { access: "settings", key: "nav.settings", to: "/settings", icon: Settings },
];
export function navigationFor(role: Role, userId: number | null): NavigationItem[] {
  const allowed = items.filter((item) => NAV_ACCESS[role].includes(item.access));
  if (role === "mentor" && userId !== null) allowed.push({ access: "settings", key: "nav.ownProfile", to: `/mentors/${userId}`, icon: UserRound });
  return [...allowed, { key: "nav.notifications", to: "/notifications", icon: Bell }].filter((item) => isPathAllowed(role, item.to, userId));
}
export function primaryNavigation(role: Role, userId: number | null): NavigationItem[] {
  const keys = role === "superadmin" || role === "mentor" ? ["nav.home", "nav.courses", "nav.journals"] : role === "student" ? ["nav.home", "nav.myCourses", "nav.notifications"] : ["nav.home", "nav.finance", "nav.notifications"];
  return navigationFor(role, userId).filter((item) => keys.includes(item.key));
}
export function matchesDestination(pathname: string, destination: string): boolean {
  return destination === "/" ? pathname === "/" : pathname === destination || pathname.startsWith(`${destination}/`);
}

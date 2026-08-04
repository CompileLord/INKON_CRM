import type { Role } from "../users/types";

export type NavKey =
  | "dashboard"
  | "students"
  | "mentors"
  | "courses"
  | "myCourses"
  | "journals"
  | "finance"
  | "audit"
  | "settings";

export const NAV_ACCESS: Record<Role, NavKey[]> = {
  superadmin: [
    "dashboard",
    "students",
    "mentors",
    "courses",
    "journals",
    "finance",
    "audit",
    "settings",
  ],
  mentor: ["dashboard", "courses", "journals", "settings"],
  student: ["dashboard", "myCourses", "settings"],
  accountant: ["dashboard", "finance", "settings"],
};

export function isPathAllowed(
  role: Role,
  pathname: string,
  userId: number | null,
): boolean {
  if (role === "superadmin") return true;

  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return true;

  const topLevel = segments[0];

  if (topLevel === "settings" || topLevel === "notifications" || topLevel === "my") {
    return true;
  }

  if (role === "mentor") {
    if (topLevel === "courses" || topLevel === "journals") {
      return true;
    }
    if (topLevel === "students" && segments.length >= 2) {
      return true;
    }
    if (topLevel === "mentors" && segments.length >= 2 && userId !== null) {
      return Number(segments[1]) === userId;
    }
    return false;
  }

  if (role === "student") {
    if (topLevel === "students" && segments.length >= 2 && userId !== null) {
      return Number(segments[1]) === userId;
    }
    return false;
  }

  if (role === "accountant") {
    if (topLevel === "finance") {
      return true;
    }
    return false;
  }

  return false;
}

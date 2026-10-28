import type { BadgeStatus } from "../ui/Badge";

interface CourseLifecycleInput {
  status: string;
  end_date: string;
}

function localIsoDate(now: Date): string {
  const month: string = String(now.getMonth() + 1).padStart(2, "0");
  const day: string = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function courseLifecycleStatus(course: CourseLifecycleInput, now: Date = new Date()): BadgeStatus {
  if (course.status === "archived") return "archived";
  return course.end_date < localIsoDate(now) ? "completed" : "active";
}

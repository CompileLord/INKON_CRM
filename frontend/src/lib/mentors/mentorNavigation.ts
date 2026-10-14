import { getSavedMentorsReturnContext, parseSafePageParam, parseSafePageSizeParam } from "../users/returnContext";

export type MentorProfileTab = "courses" | "performance" | "documents";

export function mentorLocationState(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function mentorProfileTab(value: unknown): MentorProfileTab {
  const tab = mentorLocationState(value).profileTab;
  return tab === "performance" || tab === "documents" ? tab : "courses";
}

export function mentorReturnTarget(role: string | null, userId: number | null, state: unknown) {
  if (role !== "superadmin") return { to: "/", label: "profile.backToDashboard", state: undefined };
  const directory = mentorLocationState(mentorLocationState(state).fromDirectory);
  const saved = getSavedMentorsReturnContext(role, userId);
  const parameters = new URLSearchParams();
  const query = typeof directory.search === "string" ? directory.search.replace(/[\r\n\0]/g, " ").trim() : saved?.query;
  if (query) parameters.set("q", query);
  const page = parseSafePageParam(directory.page ?? saved?.page);
  const pageSize = parseSafePageSizeParam(directory.pageSize ?? saved?.pageSize);
  if (page > 1) parameters.set("page", String(page));
  if (pageSize !== 20) parameters.set("pageSize", String(pageSize));
  const mentorId = typeof directory.mentorId === "number" && Number.isSafeInteger(directory.mentorId) && directory.mentorId > 0 ? directory.mentorId : saved?.mentorId;
  return { to: `/mentors${parameters.size ? `?${parameters}` : ""}`, label: "profile.backToTeachers", state: { fromDirectory: { mentorId } } };
}

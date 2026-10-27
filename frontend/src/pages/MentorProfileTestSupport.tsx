import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import i18n from "../i18n";
import { MentorProfile } from "./MentorProfile";
import { useAuthStore } from "../store/authStore";
import * as endpoints from "../lib/users/endpoints";
import * as documentEndpoints from "../lib/documents/endpoints";
import * as courseEndpoints from "../lib/courses/endpoints";
import type { MentorProfileResponse, MentorAnalyticsResponse, User } from "../lib/users/types";
import { clearSavedMentorsReturnContext } from "../lib/users/returnContext";


export const mentor: User = { id: 10, first_name: "Alisher", last_name: "Navoiy", email: "alisher@example.com", role: "mentor", phone: "+992900000010", date_of_birth: "1980-02-09", parent_phone: null, photo_path: null, thumbnail_path: null, payment_day_of_month: null, must_set_password: false, is_deleted: false, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" };
export const profile: MentorProfileResponse = { user: mentor, active_courses: [{ id: 2, title: "Advanced Mathematics", description: "", photo_path: null, start_date: "2026-01-01", end_date: "2026-12-31", exam_type: "monthly", price: "1200.00", mentor_id: 10, status: "active", is_deleted: false, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" }], active_students_count: 5, avg_score: 46.67, active_students_population: "active_enrollments_on_assigned_courses_including_soft_deleted_courses", avg_score_grading_state: "unknown", avg_score_provenance: "unknown", avg_score_basis: "all_summaries_on_courses_currently_assigned_including_soft_deleted_and_archived", avg_score_summary_count: 6, avg_score_defined_ratio_count: 4, avg_score_undefined_ratio_count: 2, avg_score_defined_ratios_mean: 70 };
export const analytics: MentorAnalyticsResponse = { active_courses_count: 1, active_courses_population: "active_non_deleted_courses", total_students_count: 19, total_students_population: "non_deleted_enrollments_on_assigned_courses_all_statuses_including_soft_deleted_courses", average_student_score: 62, average_student_score_grading_state: "unknown", average_student_score_provenance: "unknown", average_student_score_basis: "all_summaries_on_non_deleted_courses_including_archived_raw_points", average_student_score_summary_count: 5 };
export const clients: QueryClient[] = [];
export let navigateRoute: ReturnType<typeof useNavigate> = () => { throw new Error("Router is not mounted"); };

export function LocationControls() {
  const location = useLocation();
  const navigate = useNavigate();
  navigateRoute = navigate;
  return <><output data-testid="location">{location.pathname}{location.search}</output><button onClick={() => navigate("/mentors/11")}>Next person</button><button onClick={() => navigate("/mentors/10")}>Return person</button><button onClick={() => navigate(-1)}>Browser Back</button></>;
}

export function setup(state?: Record<string, unknown>, path = "/mentors/10") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  clients.push(queryClient);
  render(<QueryClientProvider client={queryClient}><I18nextProvider i18n={i18n}><MemoryRouter initialEntries={[{ pathname: path.split("?")[0], search: path.includes("?") ? `?${path.split("?")[1]}` : "", state }]}><LocationControls /><Routes><Route path="/mentors/:id" element={<MentorProfile />} /><Route path="/mentors" element={<h1>Teacher directory</h1>} /><Route path="/courses/:id" element={<h1>Course destination</h1>} /><Route path="/" element={<h1>Dashboard destination</h1>} /></Routes></MemoryRouter></I18nextProvider></QueryClientProvider>);
  return queryClient;
}

export function registerMentorProfileHooks(): void {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    useAuthStore.setState({ status: "authenticated", role: "superadmin", userId: 1 });
    clearSavedMentorsReturnContext();
    vi.spyOn(endpoints, "getMentorProfile").mockImplementation(async id => ({ ...profile, user: { ...mentor, id } }));
    vi.spyOn(courseEndpoints, "getCourseSchedule").mockResolvedValue([]);
    vi.spyOn(endpoints, "getMentorAnalytics").mockResolvedValue(analytics);
    vi.spyOn(documentEndpoints, "fetchDocuments").mockResolvedValue({ items: [], total: 0, page: 1, page_size: 20, total_pages: 0 });
  });
  afterEach(async () => {
    cleanup();
    for (const client of clients.splice(0)) { await client.cancelQueries(); client.clear(); }
    vi.restoreAllMocks();
  });
}

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import i18n from "../i18n";
import { Journals } from "./Journals";
import { useAuthStore } from "../store/authStore";
import * as courseEndpoints from "../lib/courses/endpoints";
import * as userEndpoints from "../lib/users/endpoints";
import type { CourseListItemResponse, ListCoursesParams, PaginatedCourses } from "../lib/courses/types";
import type { PaginatedUsers, User } from "../lib/users/types";

vi.mock("../lib/courses/endpoints", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/courses/endpoints")>();
  return { ...actual, listCourses: vi.fn() };
});

vi.mock("../lib/users/endpoints", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/users/endpoints")>();
  return { ...actual, getMentors: vi.fn(), getMentorProfile: vi.fn() };
});

function buildCourse(id: number, overrides: Partial<CourseListItemResponse> = {}): CourseListItemResponse {
  return {
    id,
    title: `Course ${id}`,
    description: "",
    photo_path: null,
    start_date: "2026-01-12",
    end_date: "2026-06-30",
    exam_type: "weekly",
    price: "100.00",
    mentor_id: 900 + id,
    status: "active",
    is_deleted: false,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    schedules: [],
    active_student_count: 0,
    ...overrides,
  };
}

function buildMentor(id: number, firstName: string, lastName: string): User {
  return {
    id,
    email: `${firstName}@example.com`,
    first_name: firstName,
    last_name: lastName,
    role: "mentor",
    date_of_birth: null,
    phone: null,
    parent_telegram_chat_id: null,
    parent_phone: null,
    photo_path: null,
    thumbnail_path: null,
    payment_day_of_month: null,
    must_set_password: false,
    is_deleted: false,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

function pageOf(items: CourseListItemResponse[], overrides: Partial<PaginatedCourses> = {}): PaginatedCourses {
  return { items, total: items.length, page: 1, page_size: 20, total_pages: 1, ...overrides };
}

function mentorPage(items: User[]): PaginatedUsers {
  return { items, total: items.length, page: 1, page_size: 100, total_pages: 1 };
}

const listCoursesMock = vi.mocked(courseEndpoints.listCourses);
const getMentorsMock = vi.mocked(userEndpoints.getMentors);
const getMentorMock = vi.mocked(userEndpoints.getMentorProfile);

let latestLocation = "";

function LocationProbe() {
  const location = useLocation();
  latestLocation = `${location.pathname}${location.search}`;
  return null;
}

function renderHub(initialEntry = "/journals", queryClient?: QueryClient) {
  const client =
    queryClient ?? new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const view = render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[initialEntry]}>
          <LocationProbe />
          <Routes>
            <Route path="/journals" element={<Journals />} />
            <Route
              path="/journals/:id"
              element={
                <div>
                  <p>journal detail</p>
                  <Link to="/journals">Journals back</Link>
                </div>
              }
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>,
  );
  return { ...view, client };
}

function lastListParams(): ListCoursesParams {
  const calls = listCoursesMock.mock.calls;
  return calls[calls.length - 1][0] as ListCoursesParams;
}

describe("Journals hub", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    window.sessionStorage.clear();
    latestLocation = "";
    listCoursesMock.mockReset();
    getMentorsMock.mockReset();
    getMentorMock.mockReset();
    useAuthStore.setState({ role: "superadmin" });
    window.scrollTo = vi.fn();
  });

  afterEach(() => {
    cleanup();
  });

  it("lets a mentor see only the endpoint's assigned courses and never calls an admin-only endpoint", async () => {
    useAuthStore.setState({ role: "mentor" });
    listCoursesMock.mockResolvedValue(pageOf([buildCourse(1), buildCourse(2)]));
    renderHub();

    expect(await screen.findByText("Course 1")).toBeTruthy();
    expect(screen.getByText("Course 2")).toBeTruthy();
    expect(getMentorsMock).not.toHaveBeenCalled();
    expect(getMentorMock).not.toHaveBeenCalled();
    expect(screen.queryByText("Mentor not available")).toBeNull();
    expect(screen.queryByText(/students/i)).toBeNull();
  });

  it("shows mentor identity to a superadmin from one directory call and no per-row requests", async () => {
    listCoursesMock.mockResolvedValue(pageOf([buildCourse(1), buildCourse(2), buildCourse(3, { mentor_id: 5555 })]));
    getMentorsMock.mockResolvedValue(
      mentorPage([buildMentor(901, "Aziza", "Karimova"), buildMentor(902, "Bakhtiyor", "Rahimov")]),
    );
    renderHub();

    expect(await screen.findByText("Aziza Karimova")).toBeTruthy();
    expect(screen.getByText("Bakhtiyor Rahimov")).toBeTruthy();
    expect(screen.getByText("Mentor not available")).toBeTruthy();
    expect(getMentorsMock).toHaveBeenCalledTimes(1);
    expect(getMentorMock).not.toHaveBeenCalled();
  });

  it("resets an invalid page offset when the status filter changes", async () => {
    listCoursesMock.mockImplementation(async (params) =>
      pageOf([buildCourse(1)], { page: params?.page ?? 1, total_pages: 3, total: 41 }),
    );
    getMentorsMock.mockResolvedValue(mentorPage([]));
    renderHub("/journals?page=3");
    await screen.findByText("Course 1");
    expect(lastListParams().page).toBe(3);

    fireEvent.click(screen.getByRole("button", { name: "Filter journals by status" }));
    fireEvent.click(screen.getByRole("option", { name: "Archived" }));

    await waitFor(() => expect(latestLocation).toBe("/journals?status=archived"));
    await waitFor(() => expect(lastListParams()).toMatchObject({ status: "archived", page: 1 }));
  });

  it("normalizes a page beyond the last page to the last real page", async () => {
    listCoursesMock.mockImplementation(async (params) =>
      pageOf([buildCourse(1)], { page: params?.page ?? 1, total_pages: 2, total: 21 }),
    );
    getMentorsMock.mockResolvedValue(mentorPage([]));
    renderHub("/journals?page=9");

    await waitFor(() => expect(latestLocation).toBe("/journals?page=2"));
  });

  it("restores query, page and scroll when returning from a journal through the plain back link", async () => {
    listCoursesMock.mockImplementation(async (params) =>
      pageOf([buildCourse(1, { title: "Python basics" }), buildCourse(2, { title: "Advanced Python" })], {
        page: params?.page ?? 1,
        total_pages: 3,
        total: 50,
      }),
    );
    getMentorsMock.mockResolvedValue(mentorPage([]));
    renderHub("/journals?q=python&page=2");
    const row = await screen.findByRole("link", { name: /Advanced Python/ });

    Object.defineProperty(window, "scrollY", { value: 480, configurable: true });
    fireEvent.click(row);
    expect(await screen.findByText("journal detail")).toBeTruthy();

    Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
    (window.scrollTo as ReturnType<typeof vi.fn>).mockClear();
    fireEvent.click(screen.getByRole("link", { name: "Journals back" }));

    await screen.findByRole("link", { name: /Advanced Python/ });
    expect(latestLocation).toBe("/journals?page=2&q=python");
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("python");
    await waitFor(() => expect(window.scrollTo).toHaveBeenCalledWith({ top: 480, behavior: "auto" }));
  });

  it("does not restore stale filters on a fresh visit that did not come from a journal", async () => {
    window.sessionStorage.clear();
    listCoursesMock.mockResolvedValue(pageOf([buildCourse(1)]));
    getMentorsMock.mockResolvedValue(mentorPage([]));
    renderHub("/journals");
    await screen.findByText("Course 1");
    expect(latestLocation).toBe("/journals");
  });

  it("distinguishes an empty catalog from a no-match result and Clear restores the list", async () => {
    getMentorsMock.mockResolvedValue(mentorPage([]));
    listCoursesMock.mockImplementation(async (params) =>
      params?.status === "archived" ? pageOf([]) : pageOf([buildCourse(1), buildCourse(2)]),
    );
    renderHub();
    await screen.findByText("Course 1");

    fireEvent.click(screen.getByRole("button", { name: "Filter journals by status" }));
    fireEvent.click(screen.getByRole("option", { name: "Archived" }));
    expect(await screen.findByText("No journals match")).toBeTruthy();
    expect(screen.queryByText("No journals yet")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Clear search and filters" }));
    expect(await screen.findByText("Course 1")).toBeTruthy();
    expect(screen.queryByText("No journals match")).toBeNull();
    expect(latestLocation).toBe("/journals");
  });

  it("shows the empty-catalog explanation without a clear action when nothing is permitted", async () => {
    listCoursesMock.mockResolvedValue(pageOf([]));
    getMentorsMock.mockResolvedValue(mentorPage([]));
    renderHub();

    expect(await screen.findByText("No journals yet")).toBeTruthy();
    expect(screen.getByText(/appears here for every course you are permitted to open/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Clear search and filters" })).toBeNull();
    expect(screen.queryByText("No journals match")).toBeNull();
    expect(screen.queryByText("0 journals")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: "Filter journals by status" })).toBeNull();
  });

  it("keeps the toolbar and count for a no-match state", async () => {
    listCoursesMock.mockImplementation(async (params) =>
      params?.status === "archived" ? pageOf([]) : pageOf([buildCourse(1)]),
    );
    getMentorsMock.mockResolvedValue(mentorPage([]));
    renderHub("/journals?status=archived");

    expect(await screen.findByText("No journals match")).toBeTruthy();
    expect(screen.getByRole("textbox")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Filter journals by status" }).textContent).toContain("Archived");
    expect(screen.getByText("0 journals")).toBeTruthy();
  });

  it("clears a search that matches nothing on the loaded page", async () => {
    listCoursesMock.mockResolvedValue(pageOf([buildCourse(1), buildCourse(2)]));
    getMentorsMock.mockResolvedValue(mentorPage([]));
    renderHub();
    await screen.findByText("Course 1");

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "zzz" } });
    expect(await screen.findByText("No journals match")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear search and filters" }));

    expect(await screen.findByText("Course 1")).toBeTruthy();
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("");
  });

  it("labels search as loaded-page scope because the endpoint has no text search", async () => {
    listCoursesMock.mockResolvedValue(pageOf([buildCourse(1), buildCourse(2), buildCourse(3)], { total: 60, total_pages: 3 }));
    getMentorsMock.mockResolvedValue(mentorPage([]));
    renderHub();
    await screen.findByText("Course 1");
    expect(screen.getByText("60 journals")).toBeTruthy();
    expect(screen.queryByText(/not the whole catalog/)).toBeNull();

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "course 2" } });

    expect(await screen.findByText("Found on this page: 1 of 3")).toBeTruthy();
    expect(screen.getByText(/not the whole catalog/)).toBeTruthy();
    expect(screen.queryByText("60 journals")).toBeNull();
    expect(lastListParams()).not.toHaveProperty("search");
    expect(lastListParams()).not.toHaveProperty("q");
  });

  it("shows a translated error whose Retry refetches the list", async () => {
    listCoursesMock.mockRejectedValueOnce(new Error("boom")).mockResolvedValue(pageOf([buildCourse(1)]));
    getMentorsMock.mockResolvedValue(mentorPage([]));
    renderHub();

    expect(await screen.findByText("Failed to load journals")).toBeTruthy();
    expect(screen.queryByText("No journals yet")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("Course 1")).toBeTruthy();
    expect(listCoursesMock).toHaveBeenCalledTimes(2);
  });

  it("keeps loaded rows and shows a local refresh failure when a background refetch fails", async () => {
    listCoursesMock.mockResolvedValueOnce(pageOf([buildCourse(1), buildCourse(2)]));
    getMentorsMock.mockResolvedValue(mentorPage([]));
    const { client } = renderHub();
    await screen.findByText("Course 1");

    listCoursesMock.mockRejectedValue(new Error("offline"));
    await act(async () => {
      await client.refetchQueries({ queryKey: ["courses", "list"] });
    });

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText(/Showing the last loaded list/)).toBeTruthy();
    expect(screen.getByText("Course 1")).toBeTruthy();
    expect(screen.getByText("Course 2")).toBeTruthy();
    expect(document.querySelector("[aria-busy='true']")).toBeNull();
    expect(screen.queryByText("No journals yet")).toBeNull();

    listCoursesMock.mockResolvedValue(pageOf([buildCourse(1), buildCourse(2)]));
    fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });

  it("renders a row-shaped skeleton while the first page loads", async () => {
    listCoursesMock.mockReturnValue(new Promise(() => {}));
    getMentorsMock.mockResolvedValue(mentorPage([]));
    renderHub();

    const busyList = await screen.findByLabelText("Journals");
    expect(busyList.getAttribute("aria-busy")).toBe("true");
    expect(busyList.querySelectorAll("li").length).toBeGreaterThanOrEqual(4);
    expect(screen.queryByText("No journals yet")).toBeNull();
  });

  it("renders each row as one real link with no nested interactive element", async () => {
    listCoursesMock.mockResolvedValue(pageOf([buildCourse(7, { title: "A very long course title ".repeat(6) })]));
    getMentorsMock.mockResolvedValue(mentorPage([buildMentor(907, "Aziza", "Karimova")]));
    renderHub();

    const link = await screen.findByRole("link", { name: /A very long course title/ });
    expect(link.getAttribute("href")).toBe("/journals/7");
    expect(link.closest("li")?.querySelectorAll("a").length).toBe(1);
    expect(link.querySelectorAll("a, button, input, select, textarea, [tabindex]").length).toBe(0);
    expect(link.textContent).not.toContain("Open journal");
    expect(link.className).not.toMatch(/translate|shadow|scale/);
    expect(link.closest("[data-list-row]")?.className).toContain("hover:bg-row-hover");
  });

  it("removes the mentor stat preamble and student-count tile", async () => {
    useAuthStore.setState({ role: "mentor" });
    listCoursesMock.mockResolvedValue(pageOf([buildCourse(1)]));
    renderHub();
    await screen.findByText("Course 1");

    expect(screen.queryByText("My Students")).toBeNull();
    expect(screen.queryByText("Needs Grading")).toBeNull();
    expect(screen.queryByText("Total Journals")).toBeNull();
  });
  it("uses the shared list row with an initial tile and a status badge only for archived journals", async () => {
    listCoursesMock.mockResolvedValue(pageOf([buildCourse(1, { title: "Algebra" }), buildCourse(2, { title: "Geometry", status: "archived" })]));
    getMentorsMock.mockResolvedValue(mentorPage([]));
    const { container } = renderHub();
    await screen.findByText("Algebra");

    const rows = container.querySelectorAll("[data-list-row]");
    expect(rows).toHaveLength(2);
    expect(rows[0].querySelector("[data-initial-tile]")?.textContent).toBe("A");
    expect(rows[0].querySelector("[data-badge-status]")).toBeNull();
    expect(rows[1].querySelector("[data-badge-status='archived']")).not.toBeNull();
    expect(container.querySelector("[data-page-container]")).not.toBeNull();
  });
});

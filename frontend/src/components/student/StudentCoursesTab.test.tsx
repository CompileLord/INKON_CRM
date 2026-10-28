import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import i18n from "../../i18n";
import { httpClient } from "../../lib/auth/httpClient";
import { StudentCoursesTab } from "./StudentCoursesTab";
import type { StudentCourseProfile, User } from "../../lib/users/types";

vi.mock("../../lib/auth/httpClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/auth/httpClient")>();
  return { ...actual, httpClient: Object.assign(actual.httpClient, { get: vi.fn() }) };
});
vi.mock("../students/EnrollNewStudentFlow", () => ({
  EnrollNewStudentFlow: (props: { open: boolean; student: User; isJustCreated?: boolean }) =>
    props.open ? <div data-testid="enroll-flow" data-student-id={props.student.id} data-created={String(props.isJustCreated)} /> : null,
}));

const student = { id: 3, first_name: "Zara", last_name: "Karimova", email: null, phone: null, photo_path: null, thumbnail_path: null } as unknown as User;
const mentor = { id: 2, first_name: "Anvar", last_name: "Sodiqov" };

function profileCourse(id: number, title: string): StudentCourseProfile {
  return {
    course: { id, title, mentor_id: 2, start_date: "2026-11-01", end_date: "2027-03-31", price: "800.00", status: "active" },
    enrollment_status: "active",
    bucket: "active",
    periods_total: 0,
    periods_graded: 0,
  } as unknown as StudentCourseProfile;
}

function renderTab(courses: StudentCourseProfile[], role: string, currentUserId = 1) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>
          <StudentCoursesTab courses={courses} student={student} role={role} currentUserId={currentUserId} />
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  );
}

function pageOf(items: unknown[]) {
  return { items, total: items.length, page: 1, page_size: 100, total_pages: 1 };
}

describe("StudentCoursesTab", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage("en");
    vi.mocked(httpClient.get).mockImplementation(async (url: string) => {
      if (url.includes("payment-options")) {
        return { data: { wallet_credit: "0", enrollments: [
          { enrollment_id: 1, course_id: 5, course_title: "Frontend", open_debt: "250.00", overdue_days: 3, remaining_contract_maximum: "0", billing_mode: "paid" },
          { enrollment_id: 2, course_id: 6, course_title: "Python", open_debt: "0", overdue_days: 0, remaining_contract_maximum: "0", billing_mode: "grant" },
          { enrollment_id: 3, course_id: 7, course_title: "Math", open_debt: "0.00", overdue_days: 0, remaining_contract_maximum: "0", billing_mode: "paid" },
        ] } };
      }
      if (url.startsWith("/courses")) {
        return { data: pageOf([{ id: 5, title: "Frontend", mentor_id: 2, schedules: [{ id: 1, course_id: 5, day_of_week: 1, time_start: "10:00", time_end: "11:30" }], active_student_count: 1 }]) };
      }
      return { data: pageOf([mentor]) };
    });
  });
  afterEach(() => cleanup());

  it("shows mentor, schedule, debt, grant and a journal link per course", async () => {
    renderTab([profileCourse(5, "Frontend"), profileCourse(6, "Python"), profileCourse(7, "Math")], "superadmin");
    expect(await screen.findByTestId("course-debt")).toBeDefined();
    expect(screen.getAllByTestId("course-debt")).toHaveLength(1);
    expect(screen.getByTestId("course-debt").textContent).toMatch(/250/);
    expect(screen.getByTestId("course-debt").textContent).toMatch(/TJS/);
    expect(screen.getByTestId("grant-badge").textContent).toBe("Grant");
    await waitFor(() => expect(screen.getAllByTestId("course-mentor")).toHaveLength(3));
    expect(screen.getAllByTestId("course-mentor")[0].textContent).toBe("Anvar Sodiqov");
    expect(screen.getByTestId("course-schedule").textContent).toMatch(/10:00.11:30/);
    const links = screen.getAllByRole("link", { name: "Journal" });
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["/journals/5", "/journals/6", "/journals/7"]);
  });

  it("opens the enroll flow for this student from the header button", async () => {
    renderTab([profileCourse(5, "Frontend")], "superadmin");
    fireEvent.click(await screen.findByRole("button", { name: "Enroll in a course" }));
    const flow = screen.getByTestId("enroll-flow");
    expect(flow.getAttribute("data-student-id")).toBe("3");
    expect(flow.getAttribute("data-created")).toBe("false");
  });

  it("offers the same button in the empty state", () => {
    renderTab([], "superadmin");
    expect(screen.getByText("No courses")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Enroll in a course" }));
    expect(screen.getByTestId("enroll-flow")).toBeDefined();
  });

  it("hides money and enrolment from a mentor and links the journal to their own course only", () => {
    renderTab([profileCourse(5, "Frontend")], "mentor", 2);
    expect(screen.queryByRole("button", { name: "Enroll in a course" })).toBeNull();
    expect(screen.getByRole("link", { name: "Journal" }).getAttribute("href")).toBe("/journals/5");
    expect(vi.mocked(httpClient.get).mock.calls.some(([url]) => String(url).includes("payment-options"))).toBe(false);
    cleanup();
    renderTab([profileCourse(5, "Frontend")], "mentor", 9);
    expect(screen.queryByRole("link", { name: "Journal" })).toBeNull();
  });

  it("sends a student to their own journal page", () => {
    renderTab([profileCourse(5, "Frontend")], "student", 3);
    expect(screen.getByRole("link", { name: "Journal" }).getAttribute("href")).toBe("/my/courses/5/journal");
  });
});

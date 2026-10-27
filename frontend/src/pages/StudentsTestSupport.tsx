import { render } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nextProvider } from "react-i18next";
import { vi } from "vitest";
import i18n from "../i18n";
import * as courseHooks from "../lib/courses/hooks";
import type { CourseListItemResponse, PaginatedCourses } from "../lib/courses/types";
import { Students } from "./Students";
import { StudentProfile } from "./StudentProfile";
import type { PaginatedUsers, StudentListItemResponse } from "../lib/users/types";

export const mockStudentsList: StudentListItemResponse[] = [
  {
    id: 11,
    email: "student11@example.com",
    first_name: "Farrukh",
    last_name: "Saidov",
    role: "student",
    phone: "+992900000011",
    parent_phone: "+992900000012",
    date_of_birth: "2006-03-20",
    payment_day_of_month: 10,
    parent_linked: true,
    is_deleted: false,
    must_set_password: false,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    photo_path: null,
    thumbnail_path: null,
    courses: [{ course_id: 5, title: "Python", enrollment_id: 51, billing_mode: "paid" }],
    debt_amount: "250.00",
    payment_status: "debt",
  },
  {
    id: 12,
    email: "student12@example.com",
    first_name: "Dilnoza",
    last_name: "Karimova",
    role: "student",
    phone: "+992900000022",
    parent_phone: null,
    date_of_birth: null,
    payment_day_of_month: 20,
    parent_linked: false,
    is_deleted: false,
    must_set_password: false,
    created_at: "2026-02-01T00:00:00Z",
    updated_at: "2026-02-01T00:00:00Z",
    photo_path: null,
    thumbnail_path: null,
    courses: [],
    debt_amount: "0.00",
    payment_status: "ok",
  },
];

export const mockPaginatedData: PaginatedUsers<StudentListItemResponse> = {
  items: mockStudentsList,
  total: 2,
  page: 1,
  page_size: 20,
  total_pages: 1,
};

export function renderStudentsPage(initialEntries = ["/students"]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  let capturedLocation: ReturnType<typeof useLocation> | null = null;
  let capturedNavigate: ReturnType<typeof useNavigate> | null = null;

  function LocationObserver() {
    capturedLocation = useLocation();
    capturedNavigate = useNavigate();
    return (
      <button
        type="button"
        data-testid="nav-courses-btn"
        onClick={() => capturedNavigate?.("/courses")}
      >
        Go to courses
      </button>
    );
  }

  const renderResult = render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={initialEntries}>
          <LocationObserver />
          <Routes>
            <Route path="/students" element={<Students />} />
            <Route path="/students/:id" element={<StudentProfile />} />
            <Route path="/courses" element={<div data-testid="courses-page">Courses Page</div>} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  );

  return {
    ...renderResult,
    getLocation: () => capturedLocation,
    navigate: (path: string) => capturedNavigate?.(path),
    queryClient,
  };
}

export function mockCoursePicker(courses: CourseListItemResponse[] = []): void {
  const coursesPage = { items: courses, total: courses.length, page: 1, page_size: 100, total_pages: 1 } as PaginatedCourses;
  vi.spyOn(courseHooks, "useCourses").mockReturnValue({
    data: coursesPage,
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof courseHooks.useCourses>);
}

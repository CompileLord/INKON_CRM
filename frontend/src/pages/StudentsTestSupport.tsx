import { render } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nextProvider } from "react-i18next";
import i18n from "../i18n";
import { Students } from "./Students";
import { StudentProfile } from "./StudentProfile";
import type { PaginatedUsers, User } from "../lib/users/types";

export const mockStudentsList: User[] = [
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
  },
];

export const mockPaginatedData: PaginatedUsers<User> = {
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

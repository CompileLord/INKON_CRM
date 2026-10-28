import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider, type UseQueryResult } from "@tanstack/react-query";
import i18n from "../../i18n";
import { CourseStudentsPane } from "./CourseStudentsPane";
import { recordCourseDetailNavigation } from "../../lib/courses/returnContext";
import * as enrollmentHooks from "../../lib/enrollments/hooks";
import type {
  CourseRosterItem,
  CourseRosterResponse,
  EligibleCandidateResponse,
  PaginatedEligibleCandidates,
  WithdrawalPreviewResponse,
} from "../../lib/enrollments/types";

vi.mock("../../lib/enrollments/hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/enrollments/hooks")>();
  return {
    ...actual,
    useCourseRosterPage: vi.fn(),
    useEligibleCandidates: vi.fn(),
    useEnrollStudent: vi.fn(),
    useWithdrawEnrollment: vi.fn(),
    useWithdrawalPreview: vi.fn(),
  };
});

vi.mock("../../lib/enrollments/endpoints", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/enrollments/endpoints")>();
  return {
    ...actual,
    locateRosterStudent: vi.fn(),
  };
});

vi.mock("../../lib/courses/returnContext", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/courses/returnContext")>();
  return {
    ...actual,
    recordCourseDetailNavigation: vi.fn(),
  };
});

function mockQueryResult<T>(data: T, isFetching = false): UseQueryResult<T, Error> {
  return {
    data,
    dataUpdatedAt: 1,
    error: null,
    errorUpdateCount: 0,
    errorUpdatedAt: 0,
    failureCount: 0,
    failureReason: null,
    fetchStatus: isFetching ? "fetching" : "idle",
    isError: false,
    isFetched: true,
    isFetchedAfterMount: true,
    isFetching,
    isInitialLoading: false,
    isLoading: false,
    isLoadingError: false,
    isPaused: false,
    isPending: false,
    isPlaceholderData: false,
    isRefetchError: false,
    isRefetching: false,
    isStale: false,
    isSuccess: true,
    isEnabled: true,
    refetch: vi.fn().mockImplementation(() => Promise.resolve({ data })),
    status: "success",
    promise: Promise.resolve(data),
  };
}

const mockCandidateOne: EligibleCandidateResponse = {
  id: 201,
  first_name: "Zara",
  last_name: "Karimova",
  email: "zara@kitob.example.com",
  phone: "+992901112233",
  photo_path: null,
  thumbnail_path: null,
};

const mockCandidateTwo: EligibleCandidateResponse = {
  id: 202,
  first_name: "Farrukh",
  last_name: "Saidov",
  email: "farrukh@kitob.example.com",
  phone: "+992904445566",
  photo_path: null,
  thumbnail_path: null,
};

const mockRosterItemOne: CourseRosterItem = {
  id: 11,
  enrollment_id: 101,
  student_id: 301,
  course_id: 42,
  price_at_enrollment: "1200.00",
  color_hex: "#083D91",
  enrolled_at: "2026-09-01T10:00:00Z",
  status: "active",
  student: {
    id: 301,
    first_name: "Alisher",
    last_name: "Navoiy",
    email: "alisher@kitob.example.com",
    phone: "+992907778899",
  },
};

const mockRosterItemTwo: CourseRosterItem = {
  id: 12,
  enrollment_id: 102,
  student_id: 302,
  course_id: 42,
  price_at_enrollment: "1200.00",
  color_hex: "#107C41",
  enrolled_at: "2026-09-05T10:00:00Z",
  status: "withdrawn",
  student: {
    id: 302,
    first_name: "Dilnoza",
    last_name: "Usmonova",
    email: "dilnoza@kitob.example.com",
    phone: null,
  },
};

describe("Course roster section", () => {
  let queryClient: QueryClient;
  let mockMutateEnrollAsync: ReturnType<typeof vi.fn>;
  let mockMutateWithdrawAsync: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    await i18n.changeLanguage("en");

    mockMutateEnrollAsync = vi.fn().mockResolvedValue({ id: 999, student_id: 201, course_id: 42 });
    vi.mocked(enrollmentHooks.useEnrollStudent).mockReturnValue({
      mutateAsync: mockMutateEnrollAsync,
      isPending: false,
    } as unknown as ReturnType<typeof enrollmentHooks.useEnrollStudent>);

    mockMutateWithdrawAsync = vi.fn().mockResolvedValue({ status: "withdrawn" });
    vi.mocked(enrollmentHooks.useWithdrawEnrollment).mockReturnValue({
      mutateAsync: mockMutateWithdrawAsync,
      isPending: false,
    } as unknown as ReturnType<typeof enrollmentHooks.useWithdrawEnrollment>);

    vi.mocked(enrollmentHooks.useWithdrawalPreview).mockReturnValue(
      mockQueryResult<WithdrawalPreviewResponse>({ still_owed: "500.00", cancelled_amount: "0.00", months_cancelled: 0 }),
    );

    vi.mocked(enrollmentHooks.useCourseRosterPage).mockReturnValue(
      mockQueryResult<CourseRosterResponse>({
        items: [mockRosterItemOne, mockRosterItemTwo],
        total: 2,
        page: 1,
        page_size: 10,
        total_pages: 1,
        active_count: 1,
      }),
    );

    vi.mocked(enrollmentHooks.useEligibleCandidates).mockReturnValue(
      mockQueryResult<PaginatedEligibleCandidates>({
        items: [mockCandidateOne, mockCandidateTwo],
        total: 2,
        page: 1,
        page_size: 10,
        total_pages: 1,
      }),
    );
  });

  afterEach(() => {
    cleanup();
  });

  function renderPane(props: Partial<Parameters<typeof CourseStudentsPane>[0]> = {}) {
    return render(
      <QueryClientProvider client={queryClient}>
        <I18nextProvider i18n={i18n}>
          <MemoryRouter>
            <CourseStudentsPane
              courseId={42}
              courseTitle="Frontend Development Mastery"
              coursePrice="1200.00"
              isSuperAdmin={true}
              isMentor={false}
              searchQuery=""
              onSearchQueryChange={vi.fn()}
              sortOption="enrolled_desc"
              onSortOptionChange={vi.fn()}
              page={1}
              onPageChange={vi.fn()}
              statusFilter="active"
              onStatusFilterChange={vi.fn()}
              onToast={vi.fn()}
              onReady={vi.fn()}
              {...props}
            />
          </MemoryRouter>
        </I18nextProvider>
      </QueryClientProvider>,
    );
  }

  it("renders each student as one row link with name, email, status badge, price and enrollment date", () => {
    renderPane();
    const rows = screen.getAllByTestId("roster-row");
    expect(rows).toHaveLength(2);
    const first = rows[0];
    expect(first.querySelector("a")?.getAttribute("href")).toBe("/students/301");
    expect(first.textContent).toContain("Alisher Navoiy");
    expect(first.textContent).toContain("alisher@kitob.example.com");
    expect(first.querySelector("[data-badge-status]")).toBeNull();
    expect(first.textContent).toContain("1 200 TJS / mo");
    expect(first.textContent).toContain("01.09.2026");
    expect(document.querySelector("table")).toBeNull();
  });

  it("offers withdraw in the row menu only to a superadmin and only for an active enrollment", async () => {
    renderPane();
    expect(screen.getAllByRole("button", { name: /Student actions/ })).toHaveLength(1);
    cleanup();
    renderPane({ isSuperAdmin: false, isMentor: true });
    expect(screen.queryByRole("button", { name: /Student actions/ })).toBeNull();
  });

  it("shows a skeleton with row geometry while loading and no empty copy", () => {
    vi.mocked(enrollmentHooks.useCourseRosterPage).mockReturnValue({ ...mockQueryResult<CourseRosterResponse | undefined>(undefined), data: undefined, isLoading: true } as unknown as ReturnType<typeof enrollmentHooks.useCourseRosterPage>);
    renderPane();
    const skeleton = document.querySelector("[data-roster-state='loading']") as HTMLElement;
    expect(skeleton.getAttribute("aria-busy")).toBe("true");
    expect(skeleton.children).toHaveLength(5);
    expect(screen.queryByText("No students enrolled yet")).toBeNull();
  });

  it("explains an empty roster to an administrator with an enroll action and to a mentor without one", () => {
    vi.mocked(enrollmentHooks.useCourseRosterPage).mockReturnValue(mockQueryResult<CourseRosterResponse>({ items: [], total: 0, page: 1, page_size: 10, total_pages: 1, active_count: 0 }));
    renderPane();
    expect(screen.getByText("No students enrolled yet")).toBeDefined();
    expect(screen.getByText("Enroll students to start the group.")).toBeDefined();
    expect(screen.getAllByRole("button", { name: "Enroll student" })).toHaveLength(2);
    cleanup();
    renderPane({ isSuperAdmin: false, isMentor: true });
    expect(screen.getByText("Students enrolled by the administrator will appear here.")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Enroll student" })).toBeNull();
  });

  it("offers a reset for an empty filtered result", () => {
    const onStatusFilterChange = vi.fn();
    const onSearchQueryChange = vi.fn();
    vi.mocked(enrollmentHooks.useCourseRosterPage).mockReturnValue(mockQueryResult<CourseRosterResponse>({ items: [], total: 0, page: 1, page_size: 10, total_pages: 1, active_count: 0 }));
    renderPane({ searchQuery: "zzz", statusFilter: "withdrawn", onStatusFilterChange, onSearchQueryChange });
    expect(screen.getByText("No students match “zzz”")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Reset filter" }));
    expect(onStatusFilterChange).toHaveBeenCalledWith("active");
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(onSearchQueryChange).toHaveBeenCalledWith("");
  });

  it("requests only active students by default and sends no status for All", () => {
    renderPane();
    expect(enrollmentHooks.useCourseRosterPage).toHaveBeenLastCalledWith(42, expect.objectContaining({ status: "active" }));
    expect(screen.getByRole("button", { name: "Status" }).textContent).toContain("Active");
    cleanup();
    renderPane({ statusFilter: "all" });
    const lastParams = vi.mocked(enrollmentHooks.useCourseRosterPage).mock.calls.at(-1)?.[1];
    expect(lastParams?.status).toBeUndefined();
    expect(lastParams).toHaveProperty("status", undefined);
    expect(screen.getByRole("button", { name: "Status" }).textContent).toContain("All");
  });

  it("selecting All reports the explicit all choice and withdrawn requests withdrawn", () => {
    const onStatusFilterChange = vi.fn();
    renderPane({ onStatusFilterChange });
    fireEvent.click(screen.getByRole("button", { name: "Status" }));
    fireEvent.click(screen.getByRole("option", { name: "All" }));
    expect(onStatusFilterChange).toHaveBeenCalledWith("all");
    cleanup();
    renderPane({ statusFilter: "withdrawn" });
    expect(enrollmentHooks.useCourseRosterPage).toHaveBeenLastCalledWith(42, expect.objectContaining({ status: "withdrawn" }));
  });

  it("records the active default in the departure context and shows no reset while on the default", () => {
    renderPane();
    expect(screen.queryByRole("button", { name: "Reset filter" })).toBeNull();
    fireEvent.click(screen.getAllByRole("link")[0]);
    expect(recordCourseDetailNavigation).toHaveBeenLastCalledWith(42, expect.objectContaining({ rosterStatus: "active" }));
  });

  it("shows the withdrawn badge on a withdrawn row in Russian", async () => {
    await i18n.changeLanguage("ru");
    vi.mocked(enrollmentHooks.useCourseRosterPage).mockReturnValue(mockQueryResult<CourseRosterResponse>({ items: [mockRosterItemTwo], total: 1, page: 1, page_size: 10, total_pages: 1, active_count: 0 }));
    renderPane({ statusFilter: "withdrawn" });
    const badge = document.querySelector("[data-badge-status='withdrawn']") as HTMLElement;
    expect(badge.textContent).toBe("Отчислен");
    await i18n.changeLanguage("en");
  });

  it("changes status and sort through the shared pickers instead of native selects", () => {
    const onStatusFilterChange = vi.fn();
    const onSortOptionChange = vi.fn();
    renderPane({ onStatusFilterChange, onSortOptionChange });
    expect(document.querySelector("select")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Status" }));
    fireEvent.click(screen.getByRole("option", { name: "Withdrawn" }));
    expect(onStatusFilterChange).toHaveBeenCalledWith("withdrawn");
    fireEvent.click(screen.getByRole("button", { name: "Order" }));
    fireEvent.click(screen.getByRole("option", { name: "Name A–Z" }));
    expect(onSortOptionChange).toHaveBeenCalledWith("name_asc");
  });

  it("shows pagination only when there is more than one page and reports the page", () => {
    const onPageChange = vi.fn();
    vi.mocked(enrollmentHooks.useCourseRosterPage).mockReturnValue(mockQueryResult<CourseRosterResponse>({ items: [mockRosterItemOne], total: 25, page: 1, page_size: 10, total_pages: 3, active_count: 25 }));
    renderPane({ onPageChange });
    fireEvent.click(screen.getByRole("button", { name: "2" }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });
});

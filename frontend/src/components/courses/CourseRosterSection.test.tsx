import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider, type UseQueryResult } from "@tanstack/react-query";
import i18n from "../../i18n";
import { CourseStudentsPane } from "./CourseStudentsPane";
import * as enrollmentHooks from "../../lib/enrollments/hooks";
import * as enrollmentEndpoints from "../../lib/enrollments/endpoints";
import * as returnContextModule from "../../lib/courses/returnContext";
import type {
  CourseRosterItem,
  CourseRosterResponse,
  EligibleCandidateResponse,
  PaginatedEligibleCandidates,
  RosterLocationResponse,
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

function mockErrorResult<T>(error: unknown): UseQueryResult<T, Error> {
  return {
    data: undefined,
    dataUpdatedAt: 0,
    error: error as Error,
    errorUpdateCount: 1,
    errorUpdatedAt: 1,
    failureCount: 1,
    failureReason: error as Error,
    fetchStatus: "idle",
    isError: true,
    isFetched: true,
    isFetchedAfterMount: true,
    isFetching: false,
    isInitialLoading: false,
    isLoading: false,
    isLoadingError: true,
    isPaused: false,
    isPending: false,
    isPlaceholderData: false,
    isRefetchError: false,
    isRefetching: false,
    isStale: false,
    isSuccess: false,
    isEnabled: true,
    refetch: vi.fn(),
    status: "error",
    promise: Promise.resolve(undefined as unknown as T),
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

  it("displays error with working retry when roster query fails", () => {
    const mockRefetch = vi.fn();
    vi.mocked(enrollmentHooks.useCourseRosterPage).mockReturnValue({
      ...mockErrorResult(new Error("Roster failure")),
      refetch: mockRefetch,
    });

    renderPane();

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Couldn't load the students");

    const retryButton = screen.getByRole("button", { name: "Retry" });
    fireEvent.click(retryButton);
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it("preserves roster rows and shows retry banner on refetch error", () => {
    const mockRefetch = vi.fn();
    vi.mocked(enrollmentHooks.useCourseRosterPage).mockReturnValue({
      ...mockQueryResult({
        items: [mockRosterItemOne, mockRosterItemTwo],
        total: 2,
        page: 1,
        page_size: 10,
        total_pages: 1,
        active_count: 1,
      }),
      isError: true,
      isRefetchError: true,
      error: new Error("Refetch error"),
      refetch: mockRefetch,
    } as unknown as ReturnType<typeof enrollmentHooks.useCourseRosterPage>);

    renderPane();

    expect(screen.getAllByRole("link", { name: /Alisher Navoiy/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /Dilnoza Usmonova/ }).length).toBeGreaterThan(0);

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Couldn't load the students");

    const retryBtn = within(alert).getByRole("button", { name: "Retry" });
    fireEvent.click(retryBtn);
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });


  it("handles hidden newly enrolled student with explicit reveal locator", async () => {
    const onSearchQueryChange = vi.fn();
    const onStatusFilterChange = vi.fn();
    const onPageChange = vi.fn();

    vi.mocked(enrollmentEndpoints.locateRosterStudent).mockResolvedValue({
      student_id: 201,
      enrollment_id: 999,
      page: 2,
      index: 14,
      total: 15,
      item: {
        id: 999,
        enrollment_id: 999,
        student_id: 201,
        course_id: 42,
        price_at_enrollment: "1200.00",
        color_hex: "#083D91",
        enrolled_at: "2026-10-12T00:00:00Z",
        status: "active",
        student: mockCandidateOne,
      },
    } as RosterLocationResponse);

    renderPane({
      onSearchQueryChange,
      onStatusFilterChange,
      onPageChange,
    });

    const enrollButton = screen.getByRole("button", { name: "Enroll student" });
    fireEvent.click(enrollButton);

    const dialog = screen.getByRole("dialog");
    const candidateRadio = within(dialog).getByRole("radio", { name: /Zara Karimova/i });
    fireEvent.click(candidateRadio);

    const submitBtn = within(dialog).getByRole("button", { name: "Enroll student" });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(
        screen.getByText(
          "The student is enrolled but is on another page or hidden by filters.",
        ),
      ).toBeDefined();
    });

    const viewButton = screen.getByRole("button", { name: "Show student" });
    fireEvent.click(viewButton);

    await waitFor(() => {
      expect(enrollmentEndpoints.locateRosterStudent).toHaveBeenCalledWith(42, 201, {
        page_size: 10,
        sort: "enrolled_desc",
      });
      expect(onSearchQueryChange).toHaveBeenCalledWith("");
      expect(onStatusFilterChange).toHaveBeenCalledWith("all");
      expect(onPageChange).toHaveBeenCalledWith(2);
    });
  });

  it("handles withdrawal flow with consequence notice, failure retention, and success", async () => {
    const onToast = vi.fn();
    mockMutateWithdrawAsync.mockRejectedValueOnce(new Error("Withdrawal failed"));

    renderPane({ onToast });

    const actionButtons = screen.getAllByRole("button", { name: /student actions/i });
    fireEvent.click(actionButtons[0]);

    const withdrawMenuItem = await screen.findByRole("menuitem", { name: /withdraw/i });
    fireEvent.click(withdrawMenuItem);

    expect(
      screen.getByText(/Withdraw Alisher Navoiy from “Frontend Development Mastery”\?/),
    ).toBeDefined();
    expect(
      screen.getByText(/They lose access to lessons and the journal\./),
    ).toBeDefined();

    const confirmButton = screen.getByRole("button", { name: "Withdraw" });
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(screen.getByText("Couldn't withdraw the student")).toBeDefined();
    });

    mockMutateWithdrawAsync.mockResolvedValueOnce({ status: "withdrawn" });
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(mockMutateWithdrawAsync).toHaveBeenCalledWith({
        id: 101,
        studentId: 301,
        courseId: 42,
      });
      expect(onToast).toHaveBeenCalledWith("Student withdrawn", "success");
    });
  });

  it("records return context when navigating to student profile", () => {
    renderPane({
      searchQuery: "Alisher",
      sortOption: "name_asc",
    });

    const studentLink = screen.getAllByRole("link", { name: /Alisher Navoiy/i })[0];
    fireEvent.click(studentLink);

    expect(returnContextModule.recordCourseDetailNavigation).toHaveBeenCalledWith(
      42,
      expect.objectContaining({
        tab: "students",
        search: "Alisher",
        sort: "name_asc",
      }),
    );
  });

  it("enforces mentor read-only privacy with zero admin reads or controls", () => {
    renderPane({
      isSuperAdmin: false,
      isMentor: true,
    });

    expect(screen.queryByRole("button", { name: "Enroll student" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Withdraw" })).toBeNull();
    expect(
      screen.getByText("Assigned mentors see this list read-only."),
    ).toBeDefined();
  });

  it("suppresses hidden notice and preserves button focus when newly enrolled student is visible on current page", async () => {
    const newlyEnrolledItem: CourseRosterItem = {
      id: 999,
      enrollment_id: 999,
      student_id: 201,
      course_id: 42,
      price_at_enrollment: "1200.00",
      color_hex: "#083D91",
      enrolled_at: "2026-10-12T00:00:00Z",
      status: "active",
      student: mockCandidateOne,
    };

    const refetchedRoster: CourseRosterResponse = {
      items: [mockRosterItemOne, mockRosterItemTwo, newlyEnrolledItem],
      total: 3,
      page: 1,
      page_size: 10,
      total_pages: 1,
      active_count: 2,
    };

    vi.mocked(enrollmentHooks.useCourseRosterPage).mockReturnValue({
      ...mockQueryResult<CourseRosterResponse>({
        items: [mockRosterItemOne, mockRosterItemTwo],
        total: 2,
        page: 1,
        page_size: 10,
        total_pages: 1,
        active_count: 1,
      }),
      refetch: vi.fn().mockResolvedValue({ data: refetchedRoster }),
    } as unknown as ReturnType<typeof enrollmentHooks.useCourseRosterPage>);

    renderPane();

    const enrollButton = screen.getByRole("button", { name: "Enroll student" });
    fireEvent.click(enrollButton);

    const dialog = screen.getByRole("dialog");
    const candidateRadio = within(dialog).getByRole("radio", { name: /Zara Karimova/i });
    fireEvent.click(candidateRadio);

    const submitBtn = within(dialog).getByRole("button", { name: "Enroll student" });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(
        screen.queryByText(
          "The student is enrolled but is on another page or hidden by filters.",
        ),
      ).toBeNull();
    });

    expect(document.activeElement).toBe(enrollButton);
  });

  it("hides roster count badge on query error or loading and displays genuine 0 on empty roster", () => {
    vi.mocked(enrollmentHooks.useCourseRosterPage).mockReturnValue({
      ...mockQueryResult<CourseRosterResponse | undefined>(undefined),
      data: undefined,
      isLoading: true,
    } as unknown as ReturnType<typeof enrollmentHooks.useCourseRosterPage>);

    const { unmount } = renderPane();
    expect(screen.queryByRole("heading", { level: 2, name: /·/ })).toBeNull();
    unmount();

    vi.mocked(enrollmentHooks.useCourseRosterPage).mockReturnValue(
      mockErrorResult<CourseRosterResponse>(new Error("Failed to load roster")),
    );

    const { unmount: unmountError } = renderPane();
    expect(screen.queryByRole("heading", { level: 2, name: /·/ })).toBeNull();
    unmountError();

    vi.mocked(enrollmentHooks.useCourseRosterPage).mockReturnValue(
      mockQueryResult<CourseRosterResponse>({
        items: [],
        total: 0,
        page: 1,
        page_size: 10,
        total_pages: 1,
        active_count: 0,
      }),
    );

    renderPane();
    expect(screen.getByRole("heading", { level: 2, name: "Students · 0" })).toBeDefined();
  });

  it("displays explicit refresh error banner and retry button when enrollment succeeds but roster refresh fails", async () => {
    let refetchCallCount = 0;
    const refetchMock = vi.fn().mockImplementation(() => {
      refetchCallCount += 1;
      if (refetchCallCount === 1) {
        return Promise.resolve({
          data: undefined,
          isError: true,
          error: new Error("Roster refetch network error"),
        });
      }
      return Promise.resolve({
        data: {
          items: [mockRosterItemOne, mockRosterItemTwo],
          total: 3,
          page: 1,
          page_size: 10,
          total_pages: 1,
          active_count: 2,
        },
        isError: false,
      });
    });

    vi.mocked(enrollmentHooks.useCourseRosterPage).mockReturnValue({
      ...mockQueryResult<CourseRosterResponse>({
        items: [mockRosterItemOne, mockRosterItemTwo],
        total: 2,
        page: 1,
        page_size: 10,
        total_pages: 1,
        active_count: 1,
      }),
      refetch: refetchMock,
    } as unknown as ReturnType<typeof enrollmentHooks.useCourseRosterPage>);

    renderPane();

    const enrollButton = screen.getByRole("button", { name: "Enroll student" });
    fireEvent.click(enrollButton);

    const dialog = screen.getByRole("dialog");
    const candidateRadio = within(dialog).getByRole("radio", { name: /Zara Karimova/i });
    fireEvent.click(candidateRadio);

    const submitBtn = within(dialog).getByRole("button", { name: "Enroll student" });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(
        screen.getByText(
          "The student was enrolled, but the list didn't refresh.",
        ),
      ).toBeDefined();
    });

    expect(
      screen.queryByText(
        "The student is enrolled but is on another page or hidden by filters.",
      ),
    ).toBeNull();

    const retryButtons = screen.getAllByRole("button", { name: "Retry" });
    const bannerRetry = retryButtons[0];
    fireEvent.click(bannerRetry);

    await waitFor(() => {
      expect(
        screen.queryByText(
          "The student was enrolled, but the list didn't refresh.",
        ),
      ).toBeNull();
    });
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { QueryClient, QueryClientProvider, type UseQueryResult } from "@tanstack/react-query";
import i18n from "../../i18n";
import { AuthApiError } from "../../lib/auth/errors";
import { EnrollStudentModal } from "./EnrollStudentModal";
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

describe("EnrollStudentModal workflows", () => {
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

  it("proves selecting a candidate does not write until explicit Enroll click", async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <I18nextProvider i18n={i18n}>
          <EnrollStudentModal
            open={true}
            courseId={42}
            courseTitle="Frontend Mastery"
            coursePrice="1200.00"
            onClose={vi.fn()}
            onEnrolled={vi.fn()}
          />
        </I18nextProvider>
      </QueryClientProvider>,
    );

    const enrollSubmitButton = screen.getByRole("button", { name: "Enroll student" });
    expect(enrollSubmitButton).toBeDefined();
    expect(enrollSubmitButton.hasAttribute("disabled")).toBe(true);

    const candidateRadio = screen.getByRole("radio", { name: /Zara Karimova/i });
    expect(candidateRadio).toBeDefined();

    fireEvent.click(candidateRadio);

    expect(mockMutateEnrollAsync).not.toHaveBeenCalled();
    expect(enrollSubmitButton.hasAttribute("disabled")).toBe(false);
    expect(screen.getByText("Change student")).toBeDefined();

    fireEvent.click(enrollSubmitButton);

    await waitFor(() => {
      expect(mockMutateEnrollAsync).toHaveBeenCalledWith({
        course_id: 42,
        student_id: 201,
        billing_mode: "paid",
        price_at_enrollment: "1200.00",
      });
    });
  });

  it("proves cancellation and close through all paths without mutation", () => {
    const handleClose = vi.fn();
    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <I18nextProvider i18n={i18n}>
          <EnrollStudentModal
            open={true}
            courseId={42}
            courseTitle="Frontend Mastery"
            coursePrice="1200.00"
            onClose={handleClose}
            onEnrolled={vi.fn()}
          />
        </I18nextProvider>
      </QueryClientProvider>,
    );

    const candidateRadio = screen.getByRole("radio", { name: /Zara Karimova/i });
    fireEvent.click(candidateRadio);
    expect(mockMutateEnrollAsync).not.toHaveBeenCalled();

    const cancelButton = screen.getByRole("button", { name: "Cancel" });
    fireEvent.click(cancelButton);
    expect(handleClose).toHaveBeenCalledTimes(1);
    expect(mockMutateEnrollAsync).not.toHaveBeenCalled();

    rerender(
      <QueryClientProvider client={queryClient}>
        <I18nextProvider i18n={i18n}>
          <EnrollStudentModal
            open={true}
            courseId={42}
            courseTitle="Frontend Mastery"
            coursePrice="1200.00"
            onClose={handleClose}
            onEnrolled={vi.fn()}
          />
        </I18nextProvider>
      </QueryClientProvider>,
    );

    const closeIconBtn = screen.getByLabelText("Close");
    fireEvent.click(closeIconBtn);
    expect(handleClose).toHaveBeenCalledTimes(2);
    expect(mockMutateEnrollAsync).not.toHaveBeenCalled();
  });

  it("handles duplicate enrollment 409 conflict and recovers with retained candidate", async () => {
    mockMutateEnrollAsync.mockRejectedValueOnce({ status: 409 });

    render(
      <QueryClientProvider client={queryClient}>
        <I18nextProvider i18n={i18n}>
          <EnrollStudentModal
            open={true}
            courseId={42}
            courseTitle="Frontend Mastery"
            coursePrice="1200.00"
            onClose={vi.fn()}
            onEnrolled={vi.fn()}
          />
        </I18nextProvider>
      </QueryClientProvider>,
    );

    const candidateRadio = screen.getByRole("radio", { name: /Zara Karimova/i });
    fireEvent.click(candidateRadio);

    const enrollSubmitButton = screen.getByRole("button", { name: "Enroll student" });
    fireEvent.click(enrollSubmitButton);

    await waitFor(() => {
      const alert = screen.getByRole("alert");
      expect(alert.textContent).toContain("This student is already enrolled in this course.");
    });

    expect(screen.getAllByText("Zara Karimova").length).toBeGreaterThan(0);
    expect(screen.getByText("Change student")).toBeDefined();
    expect(enrollSubmitButton.hasAttribute("disabled")).toBe(false);
  });

  it("shows the course-already-ended message for a 422 course_already_ended rejection", async () => {
    mockMutateEnrollAsync.mockRejectedValueOnce(new AuthApiError(422, "course_already_ended"));

    render(
      <QueryClientProvider client={queryClient}>
        <I18nextProvider i18n={i18n}>
          <EnrollStudentModal open={true} courseId={42} courseTitle="Frontend Mastery" coursePrice="1200.00" onClose={vi.fn()} onEnrolled={vi.fn()} />
        </I18nextProvider>
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole("radio", { name: /Zara Karimova/i }));
    fireEvent.click(screen.getByRole("button", { name: "Enroll student" }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("This course has already ended. Students can't be enrolled in it.");
    });
  });

  it("hides the search and candidate list once a student is selected and restores them on Change student", () => {
    vi.mocked(enrollmentHooks.useEligibleCandidates).mockReturnValue(
      mockQueryResult<PaginatedEligibleCandidates>({
        items: [mockCandidateOne],
        total: 15,
        page: 1,
        page_size: 10,
        total_pages: 2,
      }),
    );

    render(
      <QueryClientProvider client={queryClient}>
        <I18nextProvider i18n={i18n}>
          <EnrollStudentModal
            open={true}
            courseId={42}
            courseTitle="Frontend Mastery"
            coursePrice="1200.00"
            onClose={vi.fn()}
            onEnrolled={vi.fn()}
          />
        </I18nextProvider>
      </QueryClientProvider>,
    );

    const nextBtn = screen.getByRole("button", { name: "Next page" });
    expect(nextBtn.hasAttribute("disabled")).toBe(false);
    fireEvent.click(nextBtn);

    fireEvent.click(screen.getByRole("radio", { name: /Zara Karimova/i }));

    expect(screen.getAllByText("Zara Karimova")).toHaveLength(1);
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.queryByPlaceholderText("Search candidates by name or email…")).toBeNull();
    expect(screen.queryByRole("button", { name: "Next page" })).toBeNull();

    fireEvent.click(screen.getByText("Change student"));
    expect(screen.getByRole("radio", { name: /Zara Karimova/i })).toBeDefined();
    expect(screen.getByPlaceholderText("Search candidates by name or email…")).toBeDefined();
  });

  it("disables candidate modal pagination while fetching", () => {
    vi.mocked(enrollmentHooks.useEligibleCandidates).mockReturnValue({
      ...mockQueryResult(
        {
          items: [mockCandidateOne],
          total: 20,
          page: 2,
          page_size: 10,
          total_pages: 2,
        },
        true,
      ),
    });

    render(
      <QueryClientProvider client={queryClient}>
        <I18nextProvider i18n={i18n}>
          <EnrollStudentModal
            open={true}
            courseId={42}
            courseTitle="Frontend Mastery"
            coursePrice="1200.00"
            onClose={vi.fn()}
            onEnrolled={vi.fn()}
          />
        </I18nextProvider>
      </QueryClientProvider>,
    );

    const prevBtn = screen.getByRole("button", { name: "Previous page" });
    const nextBtn = screen.getByRole("button", { name: "Next page" });
    expect(prevBtn.hasAttribute("disabled")).toBe(true);
    expect(nextBtn.hasAttribute("disabled")).toBe(true);
  });

  it("synchronously locks modal submit against repeated rapid clicks", async () => {
    let resolveMutation: (val: unknown) => void = () => {};
    const mutatePromise = new Promise((resolve) => {
      resolveMutation = resolve;
    });
    const mutateAsync = vi.fn().mockReturnValue(mutatePromise);

    vi.mocked(enrollmentHooks.useEnrollStudent).mockReturnValue({
      mutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof enrollmentHooks.useEnrollStudent>);

    const onClose = vi.fn();

    render(
      <QueryClientProvider client={queryClient}>
        <I18nextProvider i18n={i18n}>
          <EnrollStudentModal
            open={true}
            courseId={42}
            courseTitle="Frontend Mastery"
            coursePrice="1200.00"
            onClose={onClose}
            onEnrolled={vi.fn()}
          />
        </I18nextProvider>
      </QueryClientProvider>,
    );

    const candidateRadio = screen.getByRole("radio", { name: /Zara Karimova/i });
    fireEvent.click(candidateRadio);

    const submitBtn = screen.getByRole("button", { name: "Enroll student" });
    fireEvent.click(submitBtn);
    fireEvent.click(submitBtn);
    fireEvent.click(submitBtn);

    expect(mutateAsync).toHaveBeenCalledTimes(1);

    const cancelBtn = screen.getByRole("button", { name: "Cancel" });
    fireEvent.click(cancelBtn);
    expect(onClose).not.toHaveBeenCalled();

    resolveMutation({
      id: 999,
      student_id: 201,
      course_id: 42,
      price_at_enrollment: "1200.00",
      color_hex: "#083D91",
      enrolled_at: "2026-10-12T00:00:00Z",
      status: "active",
      student: mockCandidateOne,
    });
  });

  it("prevents repeated submit and locks dismissal while mutation is pending", () => {
    vi.mocked(enrollmentHooks.useEnrollStudent).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: true,
    } as unknown as ReturnType<typeof enrollmentHooks.useEnrollStudent>);

    render(
      <QueryClientProvider client={queryClient}>
        <I18nextProvider i18n={i18n}>
          <EnrollStudentModal
            open={true}
            courseId={42}
            courseTitle="Frontend Mastery"
            coursePrice="1200.00"
            onClose={vi.fn()}
            onEnrolled={vi.fn()}
          />
        </I18nextProvider>
      </QueryClientProvider>,
    );

    const submitBtn = screen.getByRole("button", { name: "Enrolling…" });
    expect(submitBtn.hasAttribute("disabled")).toBe(true);

    const cancelBtn = screen.getByRole("button", { name: "Cancel" });
    expect(cancelBtn.hasAttribute("disabled")).toBe(true);

    const closeBtn = screen.getByLabelText("Close");
    expect(closeBtn.hasAttribute("disabled")).toBe(true);
  });
});

import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { chooseMentor, formState, mockRefetchMentors, mockUseCourseMentorHistory, mockUseCourseSchedule, mockUseMentors, renderWithClient, resetCourseFormMocks, sampleCourse } from "./CourseFormTestSupport";
import { CourseFormPanel } from "./CourseFormPanel";
import type { CourseResponse } from "../../lib/courses/types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuthStore } from "../../store/authStore";

vi.mock("../../lib/courses/hooks", async () => (await import("./CourseFormTestSupport")).buildCoursesHooksMock());
vi.mock("../../lib/users/hooks", async () => (await import("./CourseFormTestSupport")).buildUsersHooksMock());

afterEach(() => {
  cleanup();
  resetCourseFormMocks();
});

beforeEach(() => {
  useAuthStore.setState({ role: "superadmin" });
});

it("paginates mentors across pages for >100 mentors, exhausting load more on final page while preserving selection", async () => {
  const page1Items = Array.from({ length: 50 }, (_, i) => ({
    id: i + 1,
    first_name: "Teacher",
    last_name: `${i + 1}`,
  }));
  const page2Items = Array.from({ length: 50 }, (_, i) => ({
    id: i + 51,
    first_name: "Teacher",
    last_name: `${i + 51}`,
  }));
  const page3Items = Array.from({ length: 20 }, (_, i) => ({
    id: i + 101,
    first_name: "Teacher",
    last_name: `${i + 101}`,
  }));

  mockUseMentors.mockImplementation((params: unknown) => {
    const page = (params as { page?: number })?.page || 1;
    if (page === 1) {
      return { data: { items: page1Items, total: 120 }, isLoading: false, isError: false, refetch: mockRefetchMentors };
    }
    if (page === 2) {
      return { data: { items: page2Items, total: 120 }, isLoading: false, isError: false, refetch: mockRefetchMentors };
    }
    return { data: { items: page3Items, total: 120 }, isLoading: false, isError: false, refetch: mockRefetchMentors };
  });

  const user = userEvent.setup();
  renderWithClient(<CourseFormPanel open={true} onClose={vi.fn()} onSaved={vi.fn()} />);

  expect(screen.getByText("50 of 120 teachers")).toBeTruthy();
  await chooseMentor(user, "Teacher 10");
  const trigger = screen.getByRole("button", { name: "Mentor" });
  expect(trigger.textContent).toBe("Teacher 10");

  const loadMoreBtn = screen.getByRole("button", { name: "Load more teachers" });
  await user.click(loadMoreBtn);

  await waitFor(() => {
    expect(screen.getByText("100 of 120 teachers")).toBeTruthy();
  });
  expect(screen.getByRole("button", { name: "Mentor" }).textContent).toBe("Teacher 10");

  await user.click(loadMoreBtn);

  await waitFor(() => {
    expect(screen.getByText("120 of 120 teachers")).toBeTruthy();
  });
  expect(screen.getByRole("button", { name: "Mentor" }).textContent).toBe("Teacher 10");
  expect(screen.queryByRole("button", { name: "Load more teachers" })).toBeNull();
});

it("renders mentor error state with retry button", async () => {
  formState.mentors = {
    data: { items: [], total: 0 },
    isLoading: false,
    isError: true,
    refetch: mockRefetchMentors,
  };

  const user = userEvent.setup();
  renderWithClient(
    <CourseFormPanel open={true} onClose={vi.fn()} onSaved={vi.fn()} />,
  );

  expect(screen.getByText("Failed to load teachers")).toBeTruthy();
  const retryBtn = screen.getByRole("button", { name: "Retry" });
  await user.click(retryBtn);
  expect(mockRefetchMentors).toHaveBeenCalledTimes(1);
});

it("shows the existing weekday as a label with editable times", () => {
  renderWithClient(
    <CourseFormPanel open={true} course={sampleCourse} onClose={vi.fn()} onSaved={vi.fn()} />,
  );

  expect(screen.getByText("Monday")).toBeTruthy();
  expect((screen.getByLabelText("Monday: start time") as HTMLInputElement).value).toBe("09:00");
  expect((screen.getByLabelText("Monday: end time") as HTMLInputElement).value).toBe("11:00");
});

it("renders localized weekday names instead of raw numbers in the schedule day selector", async () => {
  const user = userEvent.setup();
  renderWithClient(<CourseFormPanel open={true} onClose={vi.fn()} onSaved={vi.fn()} />);

  const daySelect = document.querySelector<HTMLButtonElement>("#schedule-day-0");
  expect(daySelect).toBeTruthy();
  expect(daySelect?.textContent).toBe("Monday");

  await user.click(daySelect!);
  const options = (await screen.findAllByRole("option")).map((o) => o.textContent);
  expect(options).toEqual([
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ]);
});

it("handles mentor pagination failure on page 2 with translated page error and blocks advance until retry", async () => {
  const page1Items = Array.from({ length: 50 }, (_, i) => ({
    id: i + 1,
    first_name: `Mentor${i + 1}`,
    last_name: "Test",
  }));
  const page1State = {
    data: { items: page1Items, total: 100 },
    isLoading: false,
    isError: false,
    refetch: mockRefetchMentors,
  };
  const page2ErrorState = {
    data: undefined,
    isLoading: false,
    isError: true,
    refetch: mockRefetchMentors,
  };

  mockUseMentors.mockImplementation((params: unknown) => {
    const parsed = params as { page?: number } | undefined;
    return parsed?.page === 2 ? page2ErrorState : page1State;
  });

  renderWithClient(<CourseFormPanel open={true} onClose={vi.fn()} onSaved={vi.fn()} />);

  expect(screen.getByText(/50 of 100/)).toBeTruthy();

  const loadMoreBtn = screen.getByRole("button", { name: /Load more teachers/ });
  fireEvent.click(loadMoreBtn);

  await waitFor(() => {
    expect(screen.getByText("Failed to load teachers page 2")).toBeTruthy();
  });

  expect(screen.getByText(/50 of 100/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Load more teachers/ })).toBeNull();

  const retryBtn = screen.getByRole("button", { name: "Retry" });
  fireEvent.click(retryBtn);
  expect(mockRefetchMentors).toHaveBeenCalledTimes(1);
});

it("does not mount inner form or invoke data queries when open is false", () => {
  renderWithClient(<CourseFormPanel open={false} onClose={vi.fn()} onSaved={vi.fn()} />);

  expect(mockUseMentors).not.toHaveBeenCalled();
  expect(mockUseCourseMentorHistory).not.toHaveBeenCalled();
  expect(mockUseCourseSchedule).not.toHaveBeenCalled();
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("disables admin mentor history query when role is mentor", () => {
  useAuthStore.setState({ role: "mentor" });
  renderWithClient(<CourseFormPanel open={true} course={sampleCourse} onClose={vi.fn()} onSaved={vi.fn()} />);

  expect(mockUseCourseMentorHistory).toHaveBeenCalledWith(101, false);
  expect(mockUseMentors).toHaveBeenCalledWith(expect.anything(), false);
});

it("unmounts on close and re-fetches cleanly on reopen", () => {
  const { rerender } = renderWithClient(
    <CourseFormPanel open={true} course={sampleCourse} onClose={vi.fn()} onSaved={vi.fn()} />
  );
  expect(mockUseCourseSchedule).toHaveBeenCalledWith(101);

  rerender(
    <QueryClientProvider client={new QueryClient()}>
      <CourseFormPanel open={false} course={sampleCourse} onClose={vi.fn()} onSaved={vi.fn()} />
    </QueryClientProvider>
  );
  expect(screen.queryByRole("dialog")).toBeNull();

  mockUseCourseSchedule.mockClear();
  rerender(
    <QueryClientProvider client={new QueryClient()}>
      <CourseFormPanel open={true} course={sampleCourse} onClose={vi.fn()} onSaved={vi.fn()} />
    </QueryClientProvider>
  );
  expect(mockUseCourseSchedule).toHaveBeenCalledWith(101);
});

it("renders touch-visible classes and motion tokens on CourseImageUploadField overlay", () => {
  const file = new File(["dummy"], "test.png", { type: "image/png" });
  renderWithClient(<CourseFormPanel open={true} onClose={vi.fn()} onSaved={vi.fn()} />);

  const input = screen.getByLabelText(/Cover image|Course image/i) as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });

  const changeBtn = screen.getByRole("button", { name: /Change image/i });
  expect(changeBtn).toBeTruthy();
  const overlay = changeBtn.parentElement!;
  expect(overlay.className).toContain("opacity-100");
  expect(overlay.className).toContain("[@media(hover:hover)]:opacity-0");
  expect(overlay.className).toContain("motion-safe:duration-150");
});

it("represents course mentor in options in edit mode even if not in first page of loaded mentors", async () => {
  const user = userEvent.setup();
  formState.mentorHistory = {
    data: [
      {
        id: 1,
        course_id: 101,
        mentor_id: 999,
        assigned_from: "2026-01-01T00:00:00Z",
        assigned_to: null,
        mentor: {
          id: 999,
          first_name: "Special",
          last_name: "Mentor",
          email: "special@test.com",
          is_deleted: false,
        },
      },
    ],
  };

  const existingCourse: CourseResponse = {
    id: 101,
    title: "Existing Course",
    description: "Desc",
    photo_path: null,
    start_date: "2026-10-01",
    end_date: "2026-12-31",
    exam_type: "weekly",
    price: "1500",
    mentor_id: 999,
    status: "active",
    is_deleted: false,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };

  renderWithClient(
    <CourseFormPanel open={true} course={existingCourse} onClose={vi.fn()} onSaved={vi.fn()} />,
  );

  const trigger = screen.getByRole("button", { name: "Mentor" });
  expect(trigger.textContent).toBe("Special Mentor");
  await user.click(trigger);
  expect(await screen.findByRole("option", { name: "Special Mentor" })).toBeTruthy();
});

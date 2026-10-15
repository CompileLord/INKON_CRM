import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CourseFormPanel } from "./CourseFormPanel";
import { useAuthStore } from "../../store/authStore";
import type { CourseMentorHistoryResponse, CourseResponse } from "../../lib/courses/types";
import { AuthApiError } from "../../lib/auth/errors";
import "../../i18n";

vi.hoisted(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  if (!globalThis.URL.createObjectURL) {
    globalThis.URL.createObjectURL = () => "blob:mock-url";
    globalThis.URL.revokeObjectURL = () => {};
  } else {
    vi.spyOn(globalThis.URL, "createObjectURL").mockReturnValue("blob:mock-url");
    vi.spyOn(globalThis.URL, "revokeObjectURL").mockImplementation(() => {});
  }
});

interface MockMentorItem {
  id: number;
  first_name: string;
  last_name: string;
}

interface MockMentorsQueryResult {
  data?: {
    items: MockMentorItem[];
    total: number;
  };
  isLoading: boolean;
  isError: boolean;
  refetch: ReturnType<typeof vi.fn>;
}

const mockCreateMutateAsync = vi.fn();
const mockUpdateMutateAsync = vi.fn();
const mockUploadImageMutateAsync = vi.fn();
const mockRefetchMentors = vi.fn();
const mockRefetchSchedule = vi.fn();

let mockMentorsState: MockMentorsQueryResult = {
  data: { items: [{ id: 10, first_name: "Alisher", last_name: "Navoi" }], total: 1 },
  isLoading: false,
  isError: false,
  refetch: mockRefetchMentors,
};

let mockScheduleState = {
  data: [{ id: 1, course_id: 101, day_of_week: 0, time_start: "09:00:00", time_end: "11:00:00" }],
  isLoading: false,
  isError: false,
  refetch: mockRefetchSchedule,
};

let mockCreateIsPending = false;
let mockUpdateIsPending = false;
let mockUploadIsPending = false;
let mockMentorHistoryState: {
  data?: CourseMentorHistoryResponse[];
  isLoading?: boolean;
  isError?: boolean;
} = { data: [] };

const mockUseCourseSchedule = vi.fn((_id?: number) => mockScheduleState);
const mockUseCourseMentorHistory = vi.fn((_id?: number, _enabled?: boolean) => mockMentorHistoryState);

vi.mock("../../lib/courses/hooks", () => ({
  useCreateCourse: () => ({
    mutateAsync: mockCreateMutateAsync,
    isPending: mockCreateIsPending,
  }),
  useUpdateCourse: () => ({
    mutateAsync: mockUpdateMutateAsync,
    isPending: mockUpdateIsPending,
  }),
  useUploadCourseImage: () => ({
    mutateAsync: mockUploadImageMutateAsync,
    isPending: mockUploadIsPending,
  }),
  useCourseSchedule: (id?: number) => mockUseCourseSchedule(id),
  useCourseMentorHistory: (id?: number, enabled?: boolean) => mockUseCourseMentorHistory(id, enabled),
}));

const mockUseMentors = vi.fn((_params?: unknown, _enabled?: boolean): MockMentorsQueryResult => mockMentorsState);

vi.mock("../../lib/users/hooks", () => ({
  useMentors: (params: unknown, enabled?: boolean) => mockUseMentors(params, enabled),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mockCreateIsPending = false;
  mockUpdateIsPending = false;
  mockUploadIsPending = false;
  mockMentorHistoryState = { data: [] };
  mockMentorsState = {
    data: { items: [{ id: 10, first_name: "Alisher", last_name: "Navoi" }], total: 1 },
    isLoading: false,
    isError: false,
    refetch: mockRefetchMentors,
  };
  mockScheduleState = {
    data: [{ id: 1, course_id: 101, day_of_week: 0, time_start: "09:00:00", time_end: "11:00:00" }],
    isLoading: false,
    isError: false,
    refetch: mockRefetchSchedule,
  };
  mockUseMentors.mockImplementation(() => mockMentorsState);
});

beforeEach(() => {
  useAuthStore.setState({ role: "superadmin" });
});

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

const sampleCourse: CourseResponse = {
  id: 101,
  title: "Python Pro",
  description: "Advanced Python Course",
  photo_path: null,
  start_date: "2026-10-01",
  end_date: "2026-12-31",
  exam_type: "weekly",
  price: "1500.00",
  mentor_id: 10,
  status: "active",
  is_deleted: false,
  created_at: "2026-09-01T10:00:00Z",
  updated_at: "2026-09-01T10:00:00Z",
};

it("renders course form panel with course drawer variant geometry and accessible title", () => {
  renderWithClient(
    <CourseFormPanel open={true} onClose={vi.fn()} onSaved={vi.fn()} />,
  );

  const dialog = screen.getByRole("dialog");
  expect(dialog).toBeTruthy();
  expect(dialog.className).toContain("md:w-[560px]");
  expect(dialog.className).toContain("md:max-w-[560px]");
  expect(dialog.className).toContain("md:inset-y-0");
  expect(dialog.className).toContain("md:rounded-l-2xl");
  expect(dialog.className).toContain("md:origin-right");
  expect(dialog.className).toContain("origin-bottom");

  expect(screen.getByRole("heading", { name: "New Course" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
});

it("clean close writes nothing and triggers onClose without discard dialog when pristine", async () => {
  const onClose = vi.fn();
  const user = userEvent.setup();

  renderWithClient(
    <CourseFormPanel open={true} onClose={onClose} onSaved={vi.fn()} />,
  );

  const cancelBtn = screen.getByRole("button", { name: "Cancel" });
  await user.click(cancelBtn);

  expect(onClose).toHaveBeenCalledTimes(1);
  expect(screen.queryByText("Discard changes?")).toBeNull();
});

it("intercepts dirty dismissal with discard confirmation dialog and restores focus on keep editing", async () => {
  const onClose = vi.fn();
  const user = userEvent.setup();

  renderWithClient(
    <CourseFormPanel open={true} onClose={onClose} onSaved={vi.fn()} />,
  );

  const titleInput = screen.getByLabelText(/Title/);
  await user.type(titleInput, "Dirty course title");

  const cancelBtn = screen.getByRole("button", { name: "Cancel" });
  await user.click(cancelBtn);

  expect(onClose).not.toHaveBeenCalled();
  expect(screen.getByText("Discard changes?")).toBeTruthy();

  const keepEditingBtn = screen.getByRole("button", { name: "Keep editing" });
  await user.click(keepEditingBtn);

  await waitFor(() => {
    expect(screen.queryByText("Discard changes?")).toBeNull();
  });
  expect(onClose).not.toHaveBeenCalled();
});

it("discards draft and closes panel when discard is confirmed", async () => {
  const onClose = vi.fn();
  const user = userEvent.setup();

  renderWithClient(
    <CourseFormPanel open={true} onClose={onClose} onSaved={vi.fn()} />,
  );

  const titleInput = screen.getByLabelText(/Title/);
  await user.type(titleInput, "Draft to discard");

  const closeBtn = screen.getByRole("button", { name: "Close" });
  await user.click(closeBtn);

  const discardBtn = screen.getByRole("button", { name: "Discard" });
  await user.click(discardBtn);

  expect(onClose).toHaveBeenCalledTimes(1);
  await waitFor(() => {
    expect(screen.queryByText("Discard changes?")).toBeNull();
  });
});

it("restores focus to edited field when keep editing is clicked on discard confirm", async () => {
  const onClose = vi.fn();
  const user = userEvent.setup();

  renderWithClient(
    <CourseFormPanel open={true} onClose={onClose} onSaved={vi.fn()} />,
  );

  const titleInput = screen.getByLabelText(/Title/);
  await user.type(titleInput, "Draft to keep");

  const closeBtn = screen.getByRole("button", { name: "Close" });
  await user.click(closeBtn);

  const keepEditingBtn = screen.getByRole("button", { name: "Keep editing" });
  await user.click(keepEditingBtn);

  expect(onClose).not.toHaveBeenCalled();
  await waitFor(() => {
    expect(screen.queryByText("Discard changes?")).toBeNull();
  });
  expect(document.activeElement).toBe(titleInput);
});

it("omits immutable terms (price, exam_type, schedules) from PATCH payload when editing", async () => {
  const onSaved = vi.fn();
  const user = userEvent.setup();
  mockUpdateMutateAsync.mockResolvedValueOnce({
    ...sampleCourse,
    title: "Updated Title",
  });

  renderWithClient(
    <CourseFormPanel
      open={true}
      course={sampleCourse}
      onClose={vi.fn()}
      onSaved={onSaved}
    />,
  );

  expect(screen.getByText("Course terms (read-only)")).toBeTruthy();
  expect(screen.getByText("Exam type, price, and schedule cannot be changed after the course is created.")).toBeTruthy();
  expect(screen.getByText("1 500.00")).toBeTruthy();

  const titleInput = screen.getByLabelText(/Title/);
  fireEvent.change(titleInput, { target: { value: "Updated Title" } });

  const saveBtn = screen.getByRole("button", { name: "Save" });
  await user.click(saveBtn);

  await waitFor(() => {
    expect(mockUpdateMutateAsync).toHaveBeenCalledTimes(1);
  });

  const callArg = mockUpdateMutateAsync.mock.calls[0][0];
  expect(callArg.id).toBe(101);
  expect(callArg.payload).toEqual({ title: "Updated Title" });
  expect(callArg.payload.price).toBeUndefined();
  expect(callArg.payload.exam_type).toBeUndefined();
  expect(callArg.payload.schedules).toBeUndefined();
});

it("disables save button when editing an unchanged course, but enables it when an image is selected", async () => {
  renderWithClient(
    <CourseFormPanel
      open={true}
      course={sampleCourse}
      onClose={vi.fn()}
      onSaved={vi.fn()}
    />,
  );

  const saveBtn = screen.getByRole("button", { name: "Save" });
  expect(saveBtn.hasAttribute("disabled")).toBe(true);

  const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(["dummy image"], "cover.png", { type: "image/png" });
  fireEvent.change(fileInput, { target: { files: [file] } });

  await waitFor(() => {
    expect(saveBtn.hasAttribute("disabled")).toBe(false);
  });
});

it("performs image-only edit without issuing an empty course PATCH", async () => {
  const onSaved = vi.fn();
  const user = userEvent.setup();
  mockUploadImageMutateAsync.mockResolvedValueOnce({
    ...sampleCourse,
    photo_path: "/uploads/cover.png",
  });

  renderWithClient(
    <CourseFormPanel
      open={true}
      course={sampleCourse}
      onClose={vi.fn()}
      onSaved={onSaved}
    />,
  );

  const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(["dummy image"], "cover.png", { type: "image/png" });
  fireEvent.change(fileInput, { target: { files: [file] } });

  const saveBtn = screen.getByRole("button", { name: "Save" });
  await user.click(saveBtn);

  await waitFor(() => {
    expect(mockUploadImageMutateAsync).toHaveBeenCalledTimes(1);
  });
  expect(mockUpdateMutateAsync).not.toHaveBeenCalled();
  expect(onSaved).toHaveBeenCalledWith("updated", expect.objectContaining({ photo_path: "/uploads/cover.png" }));
});

it("handles partial success when course save succeeds but image upload fails, allowing retry without recreating course", async () => {
  const onSaved = vi.fn();
  const onClose = vi.fn();
  const user = userEvent.setup();

  mockCreateMutateAsync.mockResolvedValueOnce(sampleCourse);
  mockUploadImageMutateAsync.mockRejectedValueOnce(new Error("Image upload failed"));

  renderWithClient(
    <CourseFormPanel open={true} onClose={onClose} onSaved={onSaved} />,
  );

  await user.type(screen.getByLabelText(/Title/), "Full Course");
  await user.type(screen.getByLabelText(/Description/), "Full description");
  await user.type(screen.getByLabelText(/Price/), "1500");
  fireEvent.change(screen.getByLabelText(/Mentor/), { target: { value: "10" } });
  fireEvent.change(screen.getByLabelText(/Start Date/), { target: { value: "2026-10-01" } });
  fireEvent.change(screen.getByLabelText(/End Date/), { target: { value: "2026-12-31" } });

  const timeStart = document.querySelector('input[aria-label="Start time"]') as HTMLInputElement;
  const timeEnd = document.querySelector('input[aria-label="End time"]') as HTMLInputElement;
  fireEvent.change(timeStart, { target: { value: "09:00" } });
  fireEvent.change(timeEnd, { target: { value: "11:00" } });

  const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(["dummy image"], "cover.png", { type: "image/png" });
  fireEvent.change(fileInput, { target: { files: [file] } });

  const createBtn = screen.getByRole("button", { name: "Create" });
  await user.click(createBtn);

  await waitFor(() => {
    expect(mockCreateMutateAsync).toHaveBeenCalledTimes(1);
  });
  await waitFor(() => {
    expect(mockUploadImageMutateAsync).toHaveBeenCalledTimes(1);
  });

  expect(screen.getByText("Course saved, image upload pending")).toBeTruthy();
  expect(onClose).not.toHaveBeenCalled();
  expect((screen.getByLabelText(/Title/) as HTMLInputElement).disabled).toBe(true);
  expect((screen.getByLabelText(/Description/) as HTMLTextAreaElement).disabled).toBe(true);
  expect((screen.getByLabelText(/Mentor/) as HTMLSelectElement).disabled).toBe(true);
  expect((screen.getByLabelText(/Start Date/) as HTMLInputElement).disabled).toBe(true);
  expect((screen.getByLabelText(/End Date/) as HTMLInputElement).disabled).toBe(true);
  expect((screen.getByLabelText(/Title/) as HTMLInputElement).value).toBe("Full Course");
  expect((screen.getByLabelText(/Description/) as HTMLTextAreaElement).value).toBe("Full description");
  const lockedScheduleDay = document.querySelector<HTMLSelectElement>("#schedule-day-0");
  const lockedScheduleStart = document.querySelector<HTMLInputElement>("#schedule-time-start-0");
  const lockedScheduleEnd = document.querySelector<HTMLInputElement>("#schedule-time-end-0");
  expect(lockedScheduleDay?.disabled).toBe(true);
  expect(lockedScheduleStart?.disabled).toBe(true);
  expect(lockedScheduleEnd?.disabled).toBe(true);
  expect(lockedScheduleStart?.value).toBe("09:00");
  expect(lockedScheduleEnd?.value).toBe("11:00");
  for (const scheduleControl of [lockedScheduleDay, lockedScheduleStart, lockedScheduleEnd]) {
    expect(scheduleControl?.className).toContain("disabled:opacity-100");
    expect(scheduleControl?.className).not.toContain("disabled:opacity-50");
  }

  mockUploadImageMutateAsync.mockResolvedValueOnce({
    ...sampleCourse,
    photo_path: "/uploads/success.png",
  });

  const removeImageButton = screen.getByRole("button", { name: "Remove image" });
  await user.click(removeImageButton);

  const retryBtn = screen.getByRole("button", { name: "Retry image upload" });
  expect((retryBtn as HTMLButtonElement).disabled).toBe(true);

  const replacementFile = new File(["replacement image"], "replacement.png", { type: "image/png" });
  fireEvent.change(fileInput, { target: { files: [replacementFile] } });
  expect((retryBtn as HTMLButtonElement).disabled).toBe(false);
  await user.click(retryBtn);

  await waitFor(() => {
    expect(mockUploadImageMutateAsync).toHaveBeenCalledTimes(2);
  });
  expect(mockCreateMutateAsync).toHaveBeenCalledTimes(1);
  expect(mockUpdateMutateAsync).not.toHaveBeenCalled();
  expect(mockUploadImageMutateAsync).toHaveBeenNthCalledWith(2, {
    id: sampleCourse.id,
    file: replacementFile,
  });
  expect(onSaved).toHaveBeenCalledWith("created", expect.objectContaining({ photo_path: "/uploads/success.png" }));
  expect(onClose).toHaveBeenCalledTimes(1);
});

it("closing partial success state explains saved course persists and notifies parent", async () => {
  const onSaved = vi.fn();
  const onClose = vi.fn();
  const user = userEvent.setup();

  mockCreateMutateAsync.mockResolvedValueOnce(sampleCourse);
  mockUploadImageMutateAsync.mockRejectedValueOnce(new Error("Image upload failed"));

  renderWithClient(
    <CourseFormPanel open={true} onClose={onClose} onSaved={onSaved} />,
  );

  await user.type(screen.getByLabelText(/Title/), "Course 2");
  await user.type(screen.getByLabelText(/Description/), "Desc 2");
  await user.type(screen.getByLabelText(/Price/), "1500");
  fireEvent.change(screen.getByLabelText(/Mentor/), { target: { value: "10" } });
  fireEvent.change(screen.getByLabelText(/Start Date/), { target: { value: "2026-10-01" } });
  fireEvent.change(screen.getByLabelText(/End Date/), { target: { value: "2026-12-31" } });

  const timeStart = document.querySelector('input[aria-label="Start time"]') as HTMLInputElement;
  const timeEnd = document.querySelector('input[aria-label="End time"]') as HTMLInputElement;
  fireEvent.change(timeStart, { target: { value: "09:00" } });
  fireEvent.change(timeEnd, { target: { value: "11:00" } });

  const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(["dummy image"], "cover.png", { type: "image/png" });
  fireEvent.change(fileInput, { target: { files: [file] } });

  const createBtn = screen.getByRole("button", { name: "Create" });
  await user.click(createBtn);

  await waitFor(() => {
    expect(screen.getByText("Course saved, image upload pending")).toBeTruthy();
  });

  const closeSavedBtn = screen.getByRole("button", { name: "Close (course saved)" });
  await user.click(closeSavedBtn);

  expect(onClose).toHaveBeenCalledTimes(1);
  expect(onSaved).toHaveBeenCalledWith("created", sampleCourse);
});

it("focuses first invalid input on invalid form submission", async () => {
  const user = userEvent.setup();

  renderWithClient(
    <CourseFormPanel open={true} onClose={vi.fn()} onSaved={vi.fn()} />,
  );

  const titleInput = screen.getByLabelText(/Title/);
  const createBtn = screen.getByRole("button", { name: "Create" });
  await user.click(createBtn);

  await waitFor(() => {
    expect(document.activeElement).toBe(titleInput);
  });
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
  const select = screen.getByLabelText(/Mentor/i);
  fireEvent.change(select, { target: { value: "10" } });
  expect((select as HTMLSelectElement).value).toBe("10");

  const loadMoreBtn = screen.getByRole("button", { name: "Load more teachers" });
  await user.click(loadMoreBtn);

  await waitFor(() => {
    expect(screen.getByText("100 of 120 teachers")).toBeTruthy();
  });
  expect((select as HTMLSelectElement).value).toBe("10");

  await user.click(loadMoreBtn);

  await waitFor(() => {
    expect(screen.getByText("120 of 120 teachers")).toBeTruthy();
  });
  expect((select as HTMLSelectElement).value).toBe("10");
  expect(screen.queryByRole("button", { name: "Load more teachers" })).toBeNull();
});

it("renders mentor error state with retry button", async () => {
  mockMentorsState = {
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

it("formats read-only schedule times with formatTime", () => {
  renderWithClient(
    <CourseFormPanel open={true} course={sampleCourse} onClose={vi.fn()} onSaved={vi.fn()} />,
  );

  expect(screen.getByText("09:00–11:00")).toBeTruthy();
  expect(screen.getByText("Monday:")).toBeTruthy();
});

it("renders localized weekday names instead of raw numbers in the schedule day selector", () => {
  renderWithClient(<CourseFormPanel open={true} onClose={vi.fn()} onSaved={vi.fn()} />);

  const daySelect = document.querySelector<HTMLSelectElement>("#schedule-day-0");
  expect(daySelect).toBeTruthy();

  const options = Array.from(daySelect?.querySelectorAll("option") ?? []).map((o) => o.textContent);
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

it("displays translated error message on API 403 Forbidden without raw backend sentinels", async () => {
  mockCreateMutateAsync
    .mockRejectedValueOnce(new AuthApiError(403, "INTERNAL_DENIED_RAW_MESSAGE"))
    .mockResolvedValueOnce(sampleCourse);
  const user = userEvent.setup();
  const onSaved = vi.fn();

  renderWithClient(<CourseFormPanel open={true} onClose={vi.fn()} onSaved={onSaved} />);

  fireEvent.change(screen.getByLabelText(/Title/), { target: { value: "Forbidden Course" } });
  fireEvent.change(screen.getByLabelText(/Description/), { target: { value: "Desc" } });
  fireEvent.change(screen.getByLabelText(/Price/), { target: { value: "100" } });
  fireEvent.change(screen.getByLabelText(/Mentor/), { target: { value: "10" } });
  fireEvent.change(screen.getByLabelText(/Start Date/), { target: { value: "2026-10-01" } });
  fireEvent.change(screen.getByLabelText(/End Date/), { target: { value: "2026-12-31" } });
  fireEvent.change(document.querySelector('input[aria-label="Start time"]')!, { target: { value: "09:00" } });
  fireEvent.change(document.querySelector('input[aria-label="End time"]')!, { target: { value: "11:00" } });

  await user.click(screen.getByRole("button", { name: "Create" }));

  await waitFor(() => {
    expect(screen.getByText("You do not have permission to perform this action.")).toBeTruthy();
  });
  expect(screen.queryByText(/INTERNAL_DENIED_RAW_MESSAGE/)).toBeNull();
  expect((screen.getByLabelText(/Title/) as HTMLInputElement).value).toBe("Forbidden Course");
  expect((screen.getByLabelText(/Description/) as HTMLTextAreaElement).value).toBe("Desc");
  expect((screen.getByLabelText(/Title/) as HTMLInputElement).disabled).toBe(false);

  await user.click(screen.getByRole("button", { name: "Create" }));

  await waitFor(() => {
    expect(mockCreateMutateAsync).toHaveBeenCalledTimes(2);
    expect(onSaved).toHaveBeenCalledWith("created", sampleCourse);
  });
});

it("displays translated error message on duplicate title conflict without raw backend sentinels", async () => {
  mockCreateMutateAsync.mockRejectedValueOnce(new AuthApiError(409, "DUPLICATE_KEY_COURSE_TITLE"));
  const user = userEvent.setup();

  renderWithClient(<CourseFormPanel open={true} onClose={vi.fn()} onSaved={vi.fn()} />);

  fireEvent.change(screen.getByLabelText(/Title/), { target: { value: "Duplicate Course" } });
  fireEvent.change(screen.getByLabelText(/Description/), { target: { value: "Desc" } });
  fireEvent.change(screen.getByLabelText(/Price/), { target: { value: "100" } });
  fireEvent.change(screen.getByLabelText(/Mentor/), { target: { value: "10" } });
  fireEvent.change(screen.getByLabelText(/Start Date/), { target: { value: "2026-10-01" } });
  fireEvent.change(screen.getByLabelText(/End Date/), { target: { value: "2026-12-31" } });
  fireEvent.change(document.querySelector('input[aria-label="Start time"]')!, { target: { value: "09:00" } });
  fireEvent.change(document.querySelector('input[aria-label="End time"]')!, { target: { value: "11:00" } });

  await user.click(screen.getByRole("button", { name: "Create" }));

  await waitFor(() => {
    expect(screen.getByText("A course with this title or configuration already exists.")).toBeTruthy();
  });
  expect(screen.queryByText(/DUPLICATE_KEY_COURSE_TITLE/)).toBeNull();
});

it("prevents double submission on rapid clicks or Enter keypresses with synchronous lock", async () => {
  const user = userEvent.setup();
  let resolveSubmit: (val: unknown) => void;
  mockCreateMutateAsync.mockImplementation(
    () =>
      new Promise((resolve) => {
        resolveSubmit = resolve;
      }),
  );

  renderWithClient(<CourseFormPanel open={true} onClose={vi.fn()} onSaved={vi.fn()} />);

  await user.type(screen.getByLabelText(/Title/), "Concurrency Course");
  await user.type(screen.getByLabelText(/Description/), "Desc");
  await user.type(screen.getByLabelText(/Price/), "100");
  fireEvent.change(screen.getByLabelText(/Mentor/), { target: { value: "10" } });
  fireEvent.change(screen.getByLabelText(/Start Date/), { target: { value: "2026-10-01" } });
  fireEvent.change(screen.getByLabelText(/End Date/), { target: { value: "2026-12-31" } });
  fireEvent.change(document.querySelector('input[aria-label="Start time"]')!, { target: { value: "09:00" } });
  fireEvent.change(document.querySelector('input[aria-label="End time"]')!, { target: { value: "11:00" } });

  const submitBtn = screen.getByRole("button", { name: "Create" });
  await user.click(submitBtn);

  await waitFor(() => {
    expect(mockCreateMutateAsync).toHaveBeenCalledTimes(1);
  });

  await user.click(submitBtn);
  fireEvent.submit(document.querySelector("form")!);

  expect(mockCreateMutateAsync).toHaveBeenCalledTimes(1);

  resolveSubmit!({ id: 50, title: "Concurrency Course" });
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

it("blocks cancel, escape, and close while submission lock is active", async () => {
  const user = userEvent.setup();
  const onClose = vi.fn();
  let resolveSubmit: (res: CourseResponse) => void;
  mockCreateMutateAsync.mockImplementation(
    () => new Promise((resolve) => { resolveSubmit = resolve; })
  );

  renderWithClient(<CourseFormPanel open={true} onClose={onClose} onSaved={vi.fn()} />);

  await user.type(screen.getByLabelText(/Title/), "Locked Course");
  await user.type(screen.getByLabelText(/Description/), "Desc");
  await user.type(screen.getByLabelText(/Price/), "1000");
  fireEvent.change(screen.getByLabelText(/Mentor/), { target: { value: "10" } });
  fireEvent.change(screen.getByLabelText(/Start Date/), { target: { value: "2026-10-01" } });
  fireEvent.change(screen.getByLabelText(/End Date/), { target: { value: "2026-12-31" } });
  fireEvent.change(document.querySelector('input[aria-label="Start time"]')!, { target: { value: "09:00" } });
  fireEvent.change(document.querySelector('input[aria-label="End time"]')!, { target: { value: "11:00" } });

  const submitBtn = screen.getByRole("button", { name: "Create" });
  await user.click(submitBtn);
  fireEvent.submit(document.querySelector("form")!);

  await waitFor(() => {
    expect(mockCreateMutateAsync).toHaveBeenCalledTimes(1);
  });

  const cancelBtn = screen.getByRole("button", { name: "Cancel" });
  await user.click(cancelBtn);
  expect(onClose).not.toHaveBeenCalled();

  fireEvent.keyDown(window, { key: "Escape" });
  expect(onClose).not.toHaveBeenCalled();
  expect(screen.queryByText(/Discard changes/i)).toBeNull();

  resolveSubmit!({ id: 99, title: "Locked Course" } as CourseResponse);
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

it("represents course mentor in options in edit mode even if not in first page of loaded mentors", () => {
  mockMentorHistoryState = {
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

  const select = screen.getByLabelText(/Mentor/) as HTMLSelectElement;
  expect(select.value).toBe("999");
  expect(screen.getByRole("option", { name: "Special Mentor" })).toBeTruthy();
});

it("focuses schedule input when schedule time is invalid on submit", async () => {
  const user = userEvent.setup();
  renderWithClient(<CourseFormPanel open={true} onClose={vi.fn()} onSaved={vi.fn()} />);

  await user.type(screen.getByLabelText(/Title/), "Valid Title");
  await user.type(screen.getByLabelText(/Description/), "Valid Desc");
  await user.type(screen.getByLabelText(/Price/), "100");
  fireEvent.change(screen.getByLabelText(/Mentor/), { target: { value: "10" } });
  fireEvent.change(screen.getByLabelText(/Start Date/), { target: { value: "2026-10-01" } });
  fireEvent.change(screen.getByLabelText(/End Date/), { target: { value: "2026-12-31" } });

  const createBtn = screen.getByRole("button", { name: "Create" });
  await user.click(createBtn);

  await waitFor(() => {
    const timeStartInput = document.querySelector('input[aria-label="Start time"]');
    expect(document.activeElement).toBe(timeStartInput);
  });
});

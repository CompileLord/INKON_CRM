import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { chooseMentor, mockCreateMutateAsync, mockUpdateMutateAsync, mockUploadImageMutateAsync, renderWithClient, resetCourseFormMocks, sampleCourse, typeDate } from "./CourseFormTestSupport";
import { CourseFormPanel } from "./CourseFormPanel";
import type { CourseResponse } from "../../lib/courses/types";
import { useAuthStore } from "../../store/authStore";
import { AuthApiError } from "../../lib/auth/errors";

vi.mock("../../lib/courses/hooks", async () => (await import("./CourseFormTestSupport")).buildCoursesHooksMock());
vi.mock("../../lib/users/hooks", async () => (await import("./CourseFormTestSupport")).buildUsersHooksMock());

afterEach(() => {
  cleanup();
  resetCourseFormMocks();
});

beforeEach(() => {
  useAuthStore.setState({ role: "superadmin" });
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
  await chooseMentor(user, "Alisher Navoi");
  typeDate(/Start Date/, "01.10.2026");
  typeDate(/End Date/, "31.12.2026");

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
  expect((screen.getByRole("button", { name: "Mentor" }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByLabelText(/Start Date/) as HTMLInputElement).disabled).toBe(true);
  expect((screen.getByLabelText(/End Date/) as HTMLInputElement).disabled).toBe(true);
  expect((screen.getByLabelText(/Title/) as HTMLInputElement).value).toBe("Full Course");
  expect((screen.getByLabelText(/Description/) as HTMLTextAreaElement).value).toBe("Full description");
  const lockedScheduleDay = document.querySelector<HTMLButtonElement>("#schedule-day-0");
  const lockedScheduleStart = document.querySelector<HTMLInputElement>("#schedule-time-start-0");
  const lockedScheduleEnd = document.querySelector<HTMLInputElement>("#schedule-time-end-0");
  expect(lockedScheduleDay?.disabled).toBe(true);
  expect(lockedScheduleStart?.disabled).toBe(true);
  expect(lockedScheduleEnd?.disabled).toBe(true);
  expect(lockedScheduleStart?.value).toBe("09:00");
  expect(lockedScheduleEnd?.value).toBe("11:00");
  for (const scheduleControl of [lockedScheduleStart, lockedScheduleEnd]) {
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
  await chooseMentor(user, "Alisher Navoi");
  typeDate(/Start Date/, "01.10.2026");
  typeDate(/End Date/, "31.12.2026");

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
  await chooseMentor(user, "Alisher Navoi");
  typeDate(/Start Date/, "01.10.2026");
  typeDate(/End Date/, "31.12.2026");
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
  await chooseMentor(user, "Alisher Navoi");
  typeDate(/Start Date/, "01.10.2026");
  typeDate(/End Date/, "31.12.2026");
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
  await chooseMentor(user, "Alisher Navoi");
  typeDate(/Start Date/, "01.10.2026");
  typeDate(/End Date/, "31.12.2026");
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
  await chooseMentor(user, "Alisher Navoi");
  typeDate(/Start Date/, "01.10.2026");
  typeDate(/End Date/, "31.12.2026");
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

it("focuses schedule input when schedule time is invalid on submit", async () => {
  const user = userEvent.setup();
  renderWithClient(<CourseFormPanel open={true} onClose={vi.fn()} onSaved={vi.fn()} />);

  await user.type(screen.getByLabelText(/Title/), "Valid Title");
  await user.type(screen.getByLabelText(/Description/), "Valid Desc");
  await user.type(screen.getByLabelText(/Price/), "100");
  await chooseMentor(user, "Alisher Navoi");
  typeDate(/Start Date/, "01.10.2026");
  typeDate(/End Date/, "31.12.2026");

  const createBtn = screen.getByRole("button", { name: "Create" });
  await user.click(createBtn);

  await waitFor(() => {
    const timeStartInput = document.querySelector('input[aria-label="Start time"]');
    expect(document.activeElement).toBe(timeStartInput);
  });
});

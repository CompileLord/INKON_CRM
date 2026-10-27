import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockUpdateMutateAsync, mockUploadImageMutateAsync, renderWithClient, resetCourseFormMocks, sampleCourse } from "./CourseFormTestSupport";
import { CourseFormPanel } from "./CourseFormPanel";
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
  expect(screen.getByText("Exam type and price cannot be changed after the course is created.")).toBeTruthy();
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

it("builds the create form from shared Select and DatePicker controls without native selects or date inputs", () => {
  renderWithClient(<CourseFormPanel open={true} onClose={vi.fn()} onSaved={vi.fn()} />);

  const dialog = screen.getByRole("dialog");
  expect(dialog.querySelectorAll("select")).toHaveLength(0);
  expect(dialog.querySelectorAll('input[type="date"]')).toHaveLength(0);
  expect(screen.getByLabelText(/Start Date/).getAttribute("placeholder")).toBe("dd.mm.yyyy");
  expect(screen.getByRole("button", { name: "Exam Type" }).textContent).toBe("Weekly");
  expect(screen.getByRole("button", { name: "Day of week" }).textContent).toBe("Monday");
});

it("keeps one primary action in the form footer", () => {
  renderWithClient(<CourseFormPanel open={true} onClose={vi.fn()} onSaved={vi.fn()} />);

  const createButton = screen.getByRole("button", { name: "Create" });
  expect(createButton.className).toContain("bg-maroon");
  expect(screen.getByRole("button", { name: "Cancel" }).className).not.toContain("bg-maroon");
});

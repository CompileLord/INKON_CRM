import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { formState, mockUpdateMutateAsync, renderWithClient, resetCourseFormMocks, sampleCourse } from "./CourseFormTestSupport";
import { CourseFormPanel } from "./CourseFormPanel";
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
  formState.schedule = {
    ...formState.schedule,
    data: [
      { id: 1, course_id: 101, day_of_week: 0, time_start: "09:00:00", time_end: "11:00:00" },
      { id: 2, course_id: 101, day_of_week: 2, time_start: "09:00:00", time_end: "11:00:00" },
      { id: 3, course_id: 101, day_of_week: 4, time_start: "14:00:00", time_end: "16:00:00" },
    ],
  };
});

function renderEdit(): void {
  renderWithClient(<CourseFormPanel open={true} course={sampleCourse} onClose={vi.fn()} onSaved={vi.fn()} />);
}

it("sends every existing weekday with the new times when one lesson time changes", async () => {
  const user = userEvent.setup();
  mockUpdateMutateAsync.mockResolvedValueOnce(sampleCourse);
  renderEdit();

  fireEvent.change(screen.getByLabelText("Monday: start time"), { target: { value: "10:00" } });
  fireEvent.change(screen.getByLabelText("Monday: end time"), { target: { value: "12:00" } });
  await user.click(screen.getByRole("button", { name: "Save" }));

  await waitFor(() => expect(mockUpdateMutateAsync).toHaveBeenCalledTimes(1));
  expect(mockUpdateMutateAsync.mock.calls[0][0]).toEqual({
    id: 101,
    payload: {
      schedules: [
        { day_of_week: 0, time_start: "10:00:00", time_end: "12:00:00" },
        { day_of_week: 2, time_start: "09:00:00", time_end: "11:00:00" },
        { day_of_week: 4, time_start: "14:00:00", time_end: "16:00:00" },
      ],
    },
  });
});

it("keeps save disabled until a lesson time changes and omits schedules when only the title changes", async () => {
  const user = userEvent.setup();
  mockUpdateMutateAsync.mockResolvedValueOnce(sampleCourse);
  renderEdit();

  expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(screen.getByLabelText(/Title/), { target: { value: "Other" } });
  await user.click(screen.getByRole("button", { name: "Save" }));

  await waitFor(() => expect(mockUpdateMutateAsync).toHaveBeenCalledTimes(1));
  expect(mockUpdateMutateAsync.mock.calls[0][0].payload).toEqual({ title: "Other" });
});

it("offers no weekday controls in edit mode", () => {
  renderEdit();

  expect(screen.queryByRole("button", { name: "Add schedule day" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Remove schedule day" })).toBeNull();
  expect(document.querySelector("#schedule-day-0")).toBeNull();
  expect(screen.getByText("Monday")).toBeTruthy();
  expect(screen.getByText("Wednesday")).toBeTruthy();
  expect(screen.getByText("Friday")).toBeTruthy();
});

it("renders start and end dates as plain text, not inputs, in edit mode", () => {
  renderEdit();

  expect(screen.getByText("01.10.2026")).toBeTruthy();
  expect(screen.getByText("31.12.2026")).toBeTruthy();
  expect(screen.queryByLabelText(/Start Date/)).toBeNull();
  expect(screen.queryByLabelText(/End Date/)).toBeNull();
});

it("shows an inline error and blocks saving when end is not after start", async () => {
  const user = userEvent.setup();
  renderEdit();

  fireEvent.change(screen.getByLabelText("Friday: end time"), { target: { value: "14:00" } });

  expect(screen.getByText("End time must be after start time")).toBeTruthy();
  expect(screen.getByLabelText("Friday: end time").getAttribute("aria-invalid")).toBe("true");
  await user.click(screen.getByRole("button", { name: "Save" }));
  expect(mockUpdateMutateAsync).not.toHaveBeenCalled();
});

it("shows the translated message for schedule_weekdays_immutable", async () => {
  const user = userEvent.setup();
  mockUpdateMutateAsync.mockRejectedValueOnce(
    new AuthApiError(400, { code: "schedule_weekdays_immutable", message: "raw backend text" }),
  );
  renderEdit();

  fireEvent.change(screen.getByLabelText("Monday: end time"), { target: { value: "12:00" } });
  await user.click(screen.getByRole("button", { name: "Save" }));

  const alert = await screen.findByText("Lesson days cannot be added, removed or changed. Only lesson times can be edited.");
  expect(alert).toBeTruthy();
  expect(screen.queryByText("raw backend text")).toBeNull();
});

it("shows the translated message for schedule_time_range_invalid", async () => {
  const user = userEvent.setup();
  mockUpdateMutateAsync.mockRejectedValueOnce(
    new AuthApiError(422, [
      { loc: ["body", "schedules", 0], msg: "Value error, raw", type: "schedule_time_range_invalid" },
    ]),
  );
  renderEdit();

  fireEvent.change(screen.getByLabelText("Monday: end time"), { target: { value: "12:00" } });
  await user.click(screen.getByRole("button", { name: "Save" }));

  expect(await screen.findByText("End time must be after start time.")).toBeTruthy();
  expect(screen.queryByText("Value error, raw")).toBeNull();
});

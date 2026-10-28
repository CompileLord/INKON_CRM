import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { chooseMentor, mockCreateMutateAsync, renderWithClient, resetCourseFormMocks, sampleCourse, typeDate } from "./CourseFormTestSupport";
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

it("creates a course without a description and shows an empty price field with a TJS suffix", async () => {
  const user = userEvent.setup();
  mockCreateMutateAsync.mockResolvedValueOnce(sampleCourse);
  renderWithClient(<CourseFormPanel open={true} onClose={vi.fn()} onSaved={vi.fn()} />);

  const priceInput = screen.getByLabelText(/^Monthly price/) as HTMLInputElement;
  expect(priceInput.value).toBe("");
  expect(priceInput.getAttribute("placeholder")).toBeNull();
  expect(screen.getByText("TJS")).toBeTruthy();
  expect(screen.getByText("Description").textContent).not.toContain("*");

  await user.type(screen.getByLabelText(/Title/), "No description course");
  await user.type(priceInput, "1500");
  await chooseMentor(user, "Alisher Navoi");
  typeDate(/Start Date/, "01.10.2026");
  typeDate(/End Date/, "31.12.2026");
  fireEvent.change(document.querySelector('input[aria-label="Start time"]') as HTMLInputElement, { target: { value: "09:00" } });
  fireEvent.change(document.querySelector('input[aria-label="End time"]') as HTMLInputElement, { target: { value: "11:00" } });
  await user.click(screen.getByRole("button", { name: "Create" }));

  await waitFor(() => expect(mockCreateMutateAsync).toHaveBeenCalledTimes(1));
  expect(mockCreateMutateAsync.mock.calls[0][0]).toMatchObject({ title: "No description course", description: "" });
});

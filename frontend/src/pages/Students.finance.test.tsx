import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useAuthStore } from "../store/authStore";
import * as userEndpoints from "../lib/users/endpoints";
import * as userHooks from "../lib/users/hooks";
import * as enrollmentHooks from "../lib/enrollments/hooks";
import type { CourseListItemResponse } from "../lib/courses/types";
import type { User } from "../lib/users/types";
import { mockCoursePicker, mockPaginatedData, renderStudentsPage } from "./StudentsTestSupport";

vi.mock("../components/courses/EnrollStudentModal", () => ({
  EnrollStudentModal: ({ open, courseId, courseTitle }: { open: boolean; courseId: number; courseTitle: string }) =>
    open ? <div data-testid="enroll-modal">{`enroll:${courseId}:${courseTitle}`}</div> : null,
}));

const pythonCourse = { id: 5, title: "Python", price: "300.00", status: "active" } as unknown as CourseListItemResponse;
const designCourse = { id: 6, title: "Design", price: "200.00", status: "active" } as unknown as CourseListItemResponse;

beforeEach(() => {
  useAuthStore.setState({ role: "superadmin" });
  mockCoursePicker([pythonCourse, designCourse]);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Students page filters", () => {
  it("sends course and payment filters to the list endpoint, resets to page 1, and makes one request per change", async () => {
    const getStudentsSpy = vi.spyOn(userEndpoints, "getStudents").mockResolvedValue({ ...mockPaginatedData, total: 40, total_pages: 2, page: 2 });
    const fetchEnrollmentsSpy = vi.spyOn(enrollmentHooks, "fetchFilteredEnrollments");
    renderStudentsPage(["/students?page=2"]);

    await screen.findByText("Farrukh Saidov");
    expect(getStudentsSpy).toHaveBeenCalledTimes(1);
    expect(getStudentsSpy).toHaveBeenLastCalledWith({ search: undefined, page: 2, page_size: 20, course_id: undefined, payment_status: undefined });

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Course/ }));
    await user.click(await screen.findByRole("option", { name: "Python" }));

    await waitFor(() => expect(getStudentsSpy).toHaveBeenCalledTimes(2));
    expect(getStudentsSpy).toHaveBeenLastCalledWith({ search: undefined, page: 1, page_size: 20, course_id: 5, payment_status: undefined });

    await user.click(screen.getByRole("button", { name: /Balance/ }));
    await user.click(await screen.findByRole("option", { name: "In debt" }));

    await waitFor(() => expect(getStudentsSpy).toHaveBeenCalledTimes(3));
    expect(getStudentsSpy).toHaveBeenLastCalledWith({ search: undefined, page: 1, page_size: 20, course_id: 5, payment_status: "debt" });
    expect(fetchEnrollmentsSpy).not.toHaveBeenCalled();
  });

  it("shows the filtered empty state and resets filters back to the full list", async () => {
    const getStudentsSpy = vi
      .spyOn(userEndpoints, "getStudents")
      .mockImplementation(async (params) =>
        params?.payment_status === "grant"
          ? { items: [], total: 0, page: 1, page_size: 20, total_pages: 0 }
          : mockPaginatedData,
      );
    renderStudentsPage(["/students?payment=grant"]);

    expect(await screen.findByText("No students match")).toBeTruthy();
    expect(getStudentsSpy).toHaveBeenLastCalledWith(expect.objectContaining({ payment_status: "grant" }));

    const user = userEvent.setup();
    const emptyState = document.querySelector("[data-empty-state]") as HTMLElement;
    await user.click(within(emptyState).getByRole("button", { name: /Reset filters/i }));

    await screen.findByText("Farrukh Saidov");
    expect(getStudentsSpy).toHaveBeenLastCalledWith(expect.objectContaining({ payment_status: undefined, page: 1 }));
  });
});

describe("Students page enrollment after creation", () => {
  it("opens the enrollment modal for the chosen course after a student is created", async () => {
    vi.spyOn(userEndpoints, "getStudents").mockResolvedValue(mockPaginatedData);
    const newStudent: User = { ...(mockPaginatedData.items[0] as User), id: 99, first_name: "Nodir", last_name: "Yusupov", email: "n@example.com" };
    vi.spyOn(userHooks, "useCreateUser").mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue(newStudent),
      isPending: false,
    } as unknown as ReturnType<typeof userHooks.useCreateUser>);

    renderStudentsPage();
    const user = userEvent.setup();
    await screen.findByText("Farrukh Saidov");
    await user.click(screen.getByRole("button", { name: /Add Student/i }));
    await user.type(screen.getByLabelText(/First Name/i), "Nodir");
    await user.type(screen.getByLabelText(/Last Name/i), "Yusupov");
    await user.type(screen.getByLabelText(/^Email/i), "n@example.com");
    await user.type(screen.getByLabelText(/^Phone/i), "+992900000099");
    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(await screen.findByText(/Enroll Nodir Yusupov in a course now/)).toBeTruthy();
    expect(screen.queryByTestId("enroll-modal")).toBeNull();

    await user.click(screen.getByRole("button", { name: /^Course/ }));
    await user.click(await screen.findByRole("option", { name: "Design" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect((await screen.findByTestId("enroll-modal")).textContent).toBe("enroll:6:Design");
  });
});

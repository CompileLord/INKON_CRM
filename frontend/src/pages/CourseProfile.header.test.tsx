import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useAuthStore } from "../store/authStore";
import * as courseHooks from "../lib/courses/hooks";
import { mockSuccessResult, mockErrorResult, renderCourseProfile, registerCourseProfileHooks } from "./CourseProfileTestSupport";

vi.mock("../lib/courses/hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/courses/hooks")>();
  return {
    ...actual,
    useCourse: vi.fn(),
    useCourseSchedule: vi.fn(),
    useCourseJournalMetrics: vi.fn(),
    useCourseMentorHistory: vi.fn(),
    useCourseProgressChart: vi.fn(),
    useCourseStaffProgress: vi.fn(),
    useCopyCourse: vi.fn(),
    useDeleteCourse: vi.fn(),
    useCourseJournals: vi.fn(),
  };
});
vi.mock("../lib/courses/endpoints", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/courses/endpoints")>();
  return {
    ...actual,
    getCourseSchedule: vi.fn(),
  };
});
vi.mock("../lib/enrollments/hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/enrollments/hooks")>();
  return {
    ...actual,
    useCourseEnrollmentsCount: vi.fn(),
    useCourseRoster: vi.fn(),
    useCourseRosterPage: vi.fn(),
  };
});
vi.mock("../lib/users/hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/users/hooks")>();
  return {
    ...actual,
    useMentorProfile: vi.fn(),
  };
});

registerCourseProfileHooks();

describe("CourseProfile header", () => {
  it("renders one entity header with the status badge, the meta line and one primary action", () => {
    renderCourseProfile();
    expect(document.querySelectorAll("[data-entity-header]")).toHaveLength(1);
    const header = document.querySelector("[data-entity-header]") as HTMLElement;
    expect(header.querySelector("h1")?.textContent).toBe("Frontend Development Mastery");
    expect(header.querySelector("[data-badge-status='active']")).not.toBeNull();
    const meta = Array.from(header.querySelectorAll("p > span > span:not([aria-hidden])")).map((node) => node.textContent);
    expect(meta).toEqual(["Farrukh Rahimov", "Monthly exams", "01.09.2026 – 31.05.2027", "1 250.00 TJS / month"]);
    const links = header.querySelectorAll("a");
    expect(links).toHaveLength(1);
    expect(links[0].textContent).toBe("Open journal");
    expect(links[0].className).toContain("bg-maroon");
  });

  it("keeps edit, duplicate and delete in one overflow menu", async () => {
    const user = userEvent.setup();
    renderCourseProfile();
    await user.click(screen.getByRole("button", { name: "Course actions: Frontend Development Mastery" }));
    const items = await screen.findAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual(["Edit", "Duplicate", "Delete"]);
  });

  it("shows no overflow menu to a mentor", () => {
    useAuthStore.setState({ role: "mentor", userId: 101, status: "authenticated", mustSetPassword: false });
    renderCourseProfile();
    expect(document.querySelector("[data-entity-header] [aria-haspopup='menu']")).toBeNull();
  });

  it("uses the shared tabs primitive and no page-level tab bar", () => {
    renderCourseProfile();
    expect(document.querySelectorAll("[role='tablist']")).toHaveLength(1);
    expect(document.querySelector("[data-tabs='horizontal']")).not.toBeNull();
  });

  it("renders the loading skeleton with header and tile geometry", () => {
    vi.mocked(courseHooks.useCourse).mockReturnValue({ ...mockSuccessResult(undefined), data: undefined, isLoading: true, isSuccess: false, status: "pending" } as never);
    renderCourseProfile();
    expect(screen.getByRole("status").getAttribute("aria-busy")).toBe("true");
    expect(document.querySelector("[data-loading-header]")).not.toBeNull();
    expect(document.querySelector("[data-loading-tabs]")).not.toBeNull();
  });

  it("shows a failed state with a working retry when the course cannot load", () => {
    const refetch = vi.fn();
    vi.mocked(courseHooks.useCourse).mockReturnValue({ ...mockErrorResult(new Error("network")), refetch } as never);
    renderCourseProfile();
    expect(screen.getByText("Couldn't load the course")).toBeDefined();
    screen.getByRole("button", { name: "Retry" }).click();
    expect(refetch).toHaveBeenCalled();
  });
});

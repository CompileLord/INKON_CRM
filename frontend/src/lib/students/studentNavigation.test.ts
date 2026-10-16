import { afterEach, describe, expect, it, vi } from "vitest";
import { recordCourseDetailNavigation } from "../courses/returnContext";
import { getStudentProfileReturnTarget, parseStudentProfileTab } from "./studentNavigation";

afterEach(() => {
  window.sessionStorage.clear();
  vi.useRealTimers();
});

describe("student profile return context", () => {
  it("returns mentors only to an assigned course and never mistakes a journal id for a course id", () => {
    expect(
      getStudentProfileReturnTarget("mentor", 7, { from: "/courses/101" }, [{ id: 101, mentorId: 7 }]).to,
    ).toBe("/courses/101");
    expect(
      getStudentProfileReturnTarget("mentor", 7, { from: "/journals/101" }, [{ id: 101, mentorId: 7 }]).to,
    ).toBe("/");
    expect(
      getStudentProfileReturnTarget("mentor", 7, { from: "/courses/102" }, [{ id: 101, mentorId: 7 }, { id: 102, mentorId: 9 }]).to,
    ).toBe("/");
    expect(
      getStudentProfileReturnTarget("mentor", 7, { from: "/courses/101?redirect=//evil" }, [{ id: 101, mentorId: 7 }]).to,
    ).toBe("/");
  });

  it("rejects stale and cross-owner explicit course returns", () => {
    expect(getStudentProfileReturnTarget("mentor", 7, { from: "/courses/101" }, [{ id: 101, mentorId: 9 }]).to).toBe("/");
    expect(getStudentProfileReturnTarget("mentor", 9, { from: "/courses/101" }, [{ id: 101, mentorId: 7 }]).to).toBe("/");
  });

  it("restores the most recent assigned course context only after an internal roster departure", () => {
    recordCourseDetailNavigation(102, { tab: "overview" });
    recordCourseDetailNavigation(101, { tab: "students" });

    const target = getStudentProfileReturnTarget(
      "mentor",
      7,
      { fromInternalReturn: true },
      [{ id: 101, mentorId: 7 }, { id: 102, mentorId: 9 }],
    );

    expect(target.to).toBe("/courses/101");
    expect(target.state).toEqual({ fromInternalReturn: true });
  });

  it("does not restore a stale course route after the return window expires", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-14T00:00:00Z"));
    recordCourseDetailNavigation(101, { tab: "students" });
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);

    expect(getStudentProfileReturnTarget("mentor", 7, { fromInternalReturn: true }, [{ id: 101, mentorId: 7 }]).to).toBe("/");
  });

  it("will not restore a saved course context for a different mentor", () => {
    recordCourseDetailNavigation(102, { tab: "overview" });
    expect(getStudentProfileReturnTarget("mentor", 7, { fromInternalReturn: true }, [{ id: 102, mentorId: 9 }]).to).toBe("/");
  });

  it("ignores malformed directory history fields and applies supported safe pagination", () => {
    expect(getStudentProfileReturnTarget("superadmin", 1, { fromDirectory: "not-an-object" }).to).toBe("/students");
    expect(getStudentProfileReturnTarget("superadmin", 1, {
      fromDirectory: { search: { trim: "not-callable" }, page: Number.MAX_SAFE_INTEGER + 1, pageSize: 999, studentId: -1 },
    }).to).toBe("/students");
    const safeTarget = getStudentProfileReturnTarget("superadmin", 1, {
      fromDirectory: { search: "  rustam\nkarimov  ", page: "3", pageSize: "50", studentId: 42 },
    });
    expect(safeTarget.to).toBe("/students?q=rustam+karimov&page=3&pageSize=50");
    expect(safeTarget.state).toEqual({ studentId: 42 });
  });

  it("accepts only known profile tab identifiers from location state", () => {
    expect(parseStudentProfileTab({ profileTab: "performance" })).toBe("performance");
    expect(parseStudentProfileTab({ profileTab: "invalid" })).toBeUndefined();
    expect(parseStudentProfileTab("performance")).toBeUndefined();
    expect(parseStudentProfileTab(null)).toBeUndefined();
  });
});

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

describe("student profile return to a journal", () => {
  const journalUrl = "/journals/5?period=103&lesson=2026-10-13&view=summary&student=11";

  it.each(["superadmin", "mentor"])("returns %s to the exact journal context with a Back to journal label", (role) => {
    const target = getStudentProfileReturnTarget(role, 7, { fromJournal: journalUrl }, []);
    expect(target.to).toBe(journalUrl);
    expect(target.labelKey).toBe("students:backToJournal");
  });

  it.each([
    "https://evil.example/journals/5",
    "//evil.example/journals/5",
    "/journals/5/../../admin",
    "/journals/abc",
    "/journals/0",
    "/courses/5",
    "/journals/5?next=//evil#x",
    "/journals/5?x=\\evil",
    "journals/5",
    42,
    null,
  ])("rejects the forged journal return %j and keeps the existing fallback", (forged) => {
    expect(getStudentProfileReturnTarget("superadmin", 1, { fromJournal: forged }, []).to).toBe("/students");
    expect(getStudentProfileReturnTarget("mentor", 7, { fromJournal: forged }, []).to).toBe("/");
  });

  it("does not offer a journal return to a student and keeps directory and course returns unchanged", () => {
    expect(getStudentProfileReturnTarget("student", 3, { fromJournal: journalUrl }, []).to).toBe("/");
    expect(getStudentProfileReturnTarget("superadmin", 1, { fromDirectory: { search: "ann", page: 2 } }, []).to).toBe("/students?q=ann&page=2");
    expect(getStudentProfileReturnTarget("mentor", 7, { from: "/courses/101" }, [{ id: 101, mentorId: 7 }]).to).toBe("/courses/101");
  });
});


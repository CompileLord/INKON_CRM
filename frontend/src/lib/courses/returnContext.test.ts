import { beforeEach, describe, expect, it } from "vitest";
import {
  buildCourseJournalUrl,
  buildValidatedCourseListUrl,
  clearSavedCourseDetailContext,
  clearSavedScrollForCourseList,
  consumeSavedCourseDetailContext,
  getSafeCourseReturnUrl,
  getSavedCourseDetailContext,
  getSavedScrollForCourseList,
  isInternalReturnSignal,
  isValidCourseListOrigin,
  parseSafePageParam,
  recordCourseDetailNavigation,
  recordCourseListNavigation,
  validateAndSanitizeCourseListSearch,
} from "./returnContext";

describe("returnContext origin validation", () => {
  it("accepts exact /courses path and queries", () => {
    expect(isValidCourseListOrigin("/courses")).toBe(true);
    expect(isValidCourseListOrigin("/courses?page=2")).toBe(true);
    expect(isValidCourseListOrigin("/courses?status=active&sort=price")).toBe(true);
  });

  it("rejects detail paths, prefix extensions, and external routes", () => {
    expect(isValidCourseListOrigin("/courses/123")).toBe(false);
    expect(isValidCourseListOrigin("/courses/1/overview")).toBe(false);
    expect(isValidCourseListOrigin("/courses-other")).toBe(false);
    expect(isValidCourseListOrigin("/courses_archived")).toBe(false);
    expect(isValidCourseListOrigin("/journals/1")).toBe(false);
    expect(isValidCourseListOrigin("https://evil.example.com/courses")).toBe(false);
    expect(isValidCourseListOrigin("//evil.example.com/courses")).toBe(false);
    expect(isValidCourseListOrigin("/courses\\hack")).toBe(false);
    expect(isValidCourseListOrigin("/courses/../admin")).toBe(false);
    expect(isValidCourseListOrigin("")).toBe(false);
    expect(isValidCourseListOrigin(null)).toBe(false);
    expect(isValidCourseListOrigin(123)).toBe(false);
  });
});

describe("returnContext query sanitization", () => {
  it("preserves supported params and filters out unsupported fields", () => {
    const raw = "?status=active&page=3&sort=price&view=list&unsupported=value&admin=true";
    const sanitized = validateAndSanitizeCourseListSearch(raw);
    expect(sanitized).toBe("?status=active&page=3&sort=price&view=list");
  });

  it("preserves search queries containing data prefix or colons without stripping", () => {
    const raw = "?q=data:structures";
    const sanitized = validateAndSanitizeCourseListSearch(raw);
    expect(sanitized).toBe("?q=data%3Astructures");
  });

  it("preserves explicit view=grid and view=list", () => {
    expect(validateAndSanitizeCourseListSearch("?view=grid")).toBe("?view=grid");
    expect(validateAndSanitizeCourseListSearch("?view=list")).toBe("?view=list");
  });

  it("normalizes default values and rejects invalid page numbers", () => {
    expect(validateAndSanitizeCourseListSearch("?page=1&status=all&sort=newest")).toBe("");
    expect(validateAndSanitizeCourseListSearch("?page=-5")).toBe("");
    expect(validateAndSanitizeCourseListSearch("?page=abc")).toBe("");
    expect(validateAndSanitizeCourseListSearch("?page=2abc")).toBe("");
    expect(validateAndSanitizeCourseListSearch("?page=2.5")).toBe("");
    expect(validateAndSanitizeCourseListSearch("?status=hacked")).toBe("");
    expect(validateAndSanitizeCourseListSearch("?view=unsupported")).toBe("");
  });

  it("parseSafePageParam validates strictly positive safe integers", () => {
    expect(parseSafePageParam("2")).toBe(2);
    expect(parseSafePageParam("10")).toBe(10);
    expect(parseSafePageParam("2abc")).toBe(1);
    expect(parseSafePageParam("2.5")).toBe(1);
    expect(parseSafePageParam("-1")).toBe(1);
    expect(parseSafePageParam("0")).toBe(1);
    expect(parseSafePageParam("02")).toBe(2);
    expect(parseSafePageParam("9007199254740992")).toBe(1);
    expect(parseSafePageParam("")).toBe(1);
    expect(parseSafePageParam(null)).toBe(1);
    expect(parseSafePageParam(undefined)).toBe(1);
  });

  it("ensures canonical page parser and url key consistency for leading zeros and unsafe ints", () => {
    expect(validateAndSanitizeCourseListSearch("?page=02")).toBe("?page=2");
    expect(validateAndSanitizeCourseListSearch("?page=2abc")).toBe("");
    expect(validateAndSanitizeCourseListSearch("?page=2.5")).toBe("");
    expect(validateAndSanitizeCourseListSearch("?page=9007199254740992")).toBe("");
  });

  it("builds validated list URL", () => {
    expect(buildValidatedCourseListUrl("?status=archived&page=2")).toBe("/courses?status=archived&page=2");
    expect(buildValidatedCourseListUrl("")).toBe("/courses");
  });
});

describe("returnContext scroll capture and keying", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("keys scroll storage by validated list URL avoiding cross-query leakage", () => {
    recordCourseListNavigation("?page=1", 450);
    expect(getSavedScrollForCourseList("?page=1")).toBe(450);
    expect(getSavedScrollForCourseList("?page=2")).toBeNull();
    expect(getSavedScrollForCourseList("")).toBe(450);
  });

  it("rejects stored entry when search does not match validated search", () => {
    const context = {
      pathname: "/courses",
      search: "?page=3",
      scrollY: 500,
      timestamp: Date.now(),
    };
    window.sessionStorage.setItem("kitob_course_list_scroll:/courses?page=2", JSON.stringify(context));
    expect(getSavedScrollForCourseList("?page=2")).toBeNull();
  });

  it("validates non-negative finite scroll values", () => {
    recordCourseListNavigation("?page=2", -100);
    expect(getSavedScrollForCourseList("?page=2")).toBe(0);

    recordCourseListNavigation("?page=2", Number.NaN);
    expect(getSavedScrollForCourseList("?page=2")).toBe(0);
  });

  it("clears saved scroll position on demand", () => {
    recordCourseListNavigation("?page=2", 300);
    expect(getSavedScrollForCourseList("?page=2")).toBe(300);
    clearSavedScrollForCourseList("?page=2");
    expect(getSavedScrollForCourseList("?page=2")).toBeNull();
  });

  it("gracefully handles invalid JSON in session storage", () => {
    window.sessionStorage.setItem("kitob_course_list_scroll:/courses", "corrupt-json");
    expect(getSavedScrollForCourseList("")).toBeNull();
  });

  it("provides safe return URL for details page with fallback sanitization", () => {
    expect(getSafeCourseReturnUrl()).toBe("/courses");
    expect(getSafeCourseReturnUrl("/courses?malicious=payload&status=archived")).toBe("/courses?status=archived");
    recordCourseListNavigation("?status=active&page=2", 150);
    expect(getSafeCourseReturnUrl()).toBe("/courses?status=active&page=2");
  });
});

describe("course detail return context and journal URL building", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("records and restores course detail navigation context", () => {
    const context = recordCourseDetailNavigation(42, {
      tab: "students",
      search: "Alice",
      sort: "name_asc",
      scrollY: 280,
    });
    expect(context.courseId).toBe(42);
    expect(context.tab).toBe("students");
    expect(context.search).toBe("Alice");
    expect(context.sort).toBe("name_asc");
    expect(context.scrollY).toBe(280);

    const saved = getSavedCourseDetailContext(42);
    expect(saved).not.toBeNull();
    expect(saved?.tab).toBe("students");
    expect(saved?.scrollY).toBe(280);
    expect(getSavedCourseDetailContext(99)).toBeNull();
  });

  it("records and restores students tab rosterPage and rosterStatus", () => {
    const context = recordCourseDetailNavigation(42, {
      tab: "students",
      rosterPage: 3,
      rosterStatus: "withdrawn",
    });
    expect(context.rosterPage).toBe(3);
    expect(context.rosterStatus).toBe("withdrawn");

    const saved = getSavedCourseDetailContext(42);
    expect(saved).not.toBeNull();
    expect(saved?.rosterPage).toBe(3);
    expect(saved?.rosterStatus).toBe("withdrawn");
  });

  it("keeps an explicit all-statuses roster choice distinct from nothing stored", () => {
    recordCourseDetailNavigation(42, { tab: "students", rosterStatus: "all" });
    expect(getSavedCourseDetailContext(42)?.rosterStatus).toBe("all");
    sessionStorage.clear();
    recordCourseDetailNavigation(43, { tab: "students" });
    expect(getSavedCourseDetailContext(43)?.rosterStatus).toBeUndefined();
  });

  it("rejects invalid rosterPage and rosterStatus in stored payload", () => {
    sessionStorage.setItem(
      "kitob_course_detail_return:42",
      JSON.stringify({
        courseId: 42,
        tab: "students",
        rosterPage: "invalid",
        rosterStatus: "unknown",
        scrollY: 0,
        timestamp: 1000,
      }),
    );
    expect(getSavedCourseDetailContext(42)).toBeNull();
  });

  it("defaults tab to overview when unspecified", () => {
    const context = recordCourseDetailNavigation(7);
    expect(context.tab).toBe("overview");
    expect(context.scrollY).toBe(0);
  });

  it("clears saved course detail context on demand", () => {
    recordCourseDetailNavigation(42, { tab: "progress", periodId: 10 });
    expect(getSavedCourseDetailContext(42)).not.toBeNull();
    clearSavedCourseDetailContext(42);
    expect(getSavedCourseDetailContext(42)).toBeNull();
  });

  it("builds pure course journal route without writing to storage", () => {
    const url = buildCourseJournalUrl(42);
    expect(url).toBe("/journals/42");
    expect(getSavedCourseDetailContext(42)).toBeNull();
  });

  it("strictly validates and rejects adversarial detail storage payloads", () => {
    sessionStorage.setItem(
      "kitob_course_detail_return:42",
      JSON.stringify({
        courseId: 42,
        tab: "progress",
        periodId: "123bad",
        scrollY: -50,
        timestamp: "bad",
        search: { nested: true },
        sort: "unsupported",
      }),
    );
    expect(getSavedCourseDetailContext(42)).toBeNull();

    sessionStorage.setItem(
      "kitob_course_detail_return:42",
      JSON.stringify({
        courseId: 99,
        tab: "overview",
        scrollY: 0,
        timestamp: 1000,
      }),
    );
    expect(getSavedCourseDetailContext(42)).toBeNull();

    sessionStorage.setItem(
      "kitob_course_detail_return:42",
      JSON.stringify({
        courseId: 42,
        tab: "malicious_tab",
        scrollY: 0,
        timestamp: 1000,
      }),
    );
    expect(getSavedCourseDetailContext(42)).toBeNull();

    sessionStorage.setItem(
      "kitob_course_detail_return:42",
      JSON.stringify({
        courseId: 42,
        tab: "progress",
        periodId: 5,
        scrollY: 100,
        timestamp: 1000,
        search: "Alice",
        sort: "name_asc",
        view: "matrix",
      }),
    );
    const valid = getSavedCourseDetailContext(42);
    expect(valid).not.toBeNull();
    expect(valid?.periodId).toBe(5);
    expect(valid?.search).toBe("Alice");
    expect(valid?.sort).toBe("name_asc");
    expect(valid?.view).toBe("matrix");

    sessionStorage.setItem(
      "kitob_course_detail_return:42",
      JSON.stringify({
        courseId: 42,
        tab: "progress",
        scrollY: 0,
        timestamp: 1000,
        view: "unsupported",
      }),
    );
    expect(getSavedCourseDetailContext(42)).toBeNull();
  });

  it("consumeSavedCourseDetailContext reads and clears stored context", () => {
    recordCourseDetailNavigation(42, {
      tab: "progress",
      periodId: 3,
      search: "Bob",
      sort: "avg_desc",
      view: "table",
      scrollY: 150,
    });
    const consumed = consumeSavedCourseDetailContext(42);
    expect(consumed).not.toBeNull();
    expect(consumed?.periodId).toBe(3);
    expect(consumed?.search).toBe("Bob");
    expect(consumed?.view).toBe("table");
    expect(consumed?.scrollY).toBe(150);

    expect(getSavedCourseDetailContext(42)).toBeNull();
    expect(consumeSavedCourseDetailContext(42)).toBeNull();
  });

  it("accepts score_desc and score_asc sorts in course detail navigation", () => {
    recordCourseDetailNavigation(42, {
      tab: "progress",
      sort: "score_desc",
    });
    expect(getSavedCourseDetailContext(42)?.sort).toBe("score_desc");

    recordCourseDetailNavigation(42, {
      tab: "progress",
      sort: "score_asc",
    });
    expect(getSavedCourseDetailContext(42)?.sort).toBe("score_asc");
  });

  it("isInternalReturnSignal differentiates internal return signals from direct entry", () => {
    expect(isInternalReturnSignal({ fromInternalReturn: true })).toBe(true);
    expect(isInternalReturnSignal(null, new URLSearchParams("return=1"))).toBe(true);
    expect(isInternalReturnSignal(null, new URLSearchParams("returned=1"))).toBe(true);

    expect(isInternalReturnSignal(null, new URLSearchParams())).toBe(false);
    expect(isInternalReturnSignal({}, new URLSearchParams())).toBe(false);
    expect(isInternalReturnSignal({ fromInternalReturn: false }, new URLSearchParams())).toBe(false);
    expect(isInternalReturnSignal(null, null)).toBe(false);
  });
});

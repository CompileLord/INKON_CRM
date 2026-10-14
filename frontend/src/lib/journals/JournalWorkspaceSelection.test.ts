import { describe, expect, it } from "vitest";
import type { Location } from "react-router-dom";
import { JournalWorkspaceSelection } from "./JournalWorkspaceSelection";
import type { JournalPeriod } from "../courses/types";

function period(id: number, start: string, end: string): JournalPeriod {
  return { id, course_id: 5, period_label: `Period ${id}`, period_start: start, period_end: end, period_type: "month" };
}

const PERIODS: JournalPeriod[] = [
  period(30, "2026-10-01", "2026-10-31"),
  period(10, "2026-08-01", "2026-08-31"),
  period(20, "2026-09-01", "2026-09-30"),
];

describe("course route identifier", () => {
  it.each([
    ["7", 7],
    ["1204", 1204],
  ])("accepts the positive integer %s", (raw, expected) => {
    expect(JournalWorkspaceSelection.parseCourseId(raw)).toBe(expected);
  });

  it.each([undefined, "", "0", "-3", "1.5", "7abc", "0x10", " 7", "99999999999999999999"])(
    "rejects the malformed course identifier %j",
    (raw) => {
      expect(JournalWorkspaceSelection.parseCourseId(raw)).toBeUndefined();
    },
  );
});

describe("period selection", () => {
  it("selects the period containing today and calls it current", () => {
    const resolution = JournalWorkspaceSelection.resolvePeriod(PERIODS, null, "2026-09-15");
    expect(resolution.period?.id).toBe(20);
    expect(resolution.source).toBe("current");
    expect(resolution.queryInvalid).toBe(false);
  });

  it("treats the first and last day of a period as inside it", () => {
    expect(JournalWorkspaceSelection.resolvePeriod(PERIODS, null, "2026-09-01").period?.id).toBe(20);
    expect(JournalWorkspaceSelection.resolvePeriod(PERIODS, null, "2026-09-30").period?.id).toBe(20);
  });

  it("falls back to the latest already-started period in a gap and calls it latest", () => {
    const gapped: JournalPeriod[] = [period(1, "2026-08-01", "2026-08-31"), period(2, "2026-10-01", "2026-10-31")];
    const resolution = JournalWorkspaceSelection.resolvePeriod(gapped, null, "2026-09-15");
    expect(resolution.period?.id).toBe(1);
    expect(resolution.source).toBe("latest");
  });

  it("falls back to the latest period after the course calendar has ended", () => {
    const resolution = JournalWorkspaceSelection.resolvePeriod(PERIODS, null, "2027-02-01");
    expect(resolution.period?.id).toBe(30);
    expect(resolution.source).toBe("latest");
  });

  it("falls back to the earliest upcoming period when every period is in the future", () => {
    const resolution = JournalWorkspaceSelection.resolvePeriod(PERIODS, null, "2026-01-05");
    expect(resolution.period?.id).toBe(10);
    expect(resolution.source).toBe("upcoming");
  });

  it("honours a valid period query that belongs to this course", () => {
    const resolution = JournalWorkspaceSelection.resolvePeriod(PERIODS, "10", "2026-09-15");
    expect(resolution.period?.id).toBe(10);
    expect(resolution.source).toBe("query");
    expect(resolution.queryInvalid).toBe(false);
  });

  it.each(["999", "abc", "-1", "1.5", "", "20abc"])(
    "rejects the foreign or malformed period query %j and uses the documented fallback",
    (raw) => {
      const resolution = JournalWorkspaceSelection.resolvePeriod(PERIODS, raw, "2026-09-15");
      expect(resolution.queryInvalid).toBe(true);
      expect(resolution.period?.id).toBe(20);
      expect(resolution.source).toBe("current");
    },
  );

  it("reports no period, never a fabricated one, for an empty period list", () => {
    const resolution = JournalWorkspaceSelection.resolvePeriod([], null, "2026-09-15");
    expect(resolution.period).toBeUndefined();
    expect(resolution.source).toBeUndefined();
  });

  it("labels the timing of each period truthfully", () => {
    const timing = (id: number, today: string) =>
      JournalWorkspaceSelection.timingOf(PERIODS.find((candidate) => candidate.id === id) as JournalPeriod, PERIODS, today);
    expect(timing(20, "2026-09-15")).toBe("current");
    expect(timing(10, "2026-09-15")).toBe("past");
    expect(timing(30, "2026-09-15")).toBe("upcoming");
    expect(timing(30, "2027-02-01")).toBe("latest");
    expect(timing(20, "2027-02-01")).toBe("past");
  });

  it("never calls a past period latest while another period is date-active", () => {
    expect(
      JournalWorkspaceSelection.timingOf(PERIODS[1], PERIODS, "2026-09-15"),
    ).not.toBe("latest");
  });
});

describe("lesson selection", () => {
  const LESSONS = ["2026-09-08", "2026-09-01", "2026-09-15", "2026-09-22"];

  it("prefers a valid explicit lesson", () => {
    const resolution = JournalWorkspaceSelection.resolveLesson(LESSONS, "2026-09-15", "2026-09-22");
    expect(resolution).toEqual({ lesson: "2026-09-15", source: "query", queryInvalid: false });
  });

  it("selects today's lesson when there is one", () => {
    const resolution = JournalWorkspaceSelection.resolveLesson(LESSONS, null, "2026-09-15");
    expect(resolution.lesson).toBe("2026-09-15");
    expect(resolution.source).toBe("today");
  });

  it("selects the latest lesson on or before today when none is scheduled today", () => {
    const resolution = JournalWorkspaceSelection.resolveLesson(LESSONS, null, "2026-09-17");
    expect(resolution.lesson).toBe("2026-09-15");
    expect(resolution.source).toBe("latest");
  });

  it("selects the first lesson when every lesson is still in the future", () => {
    const resolution = JournalWorkspaceSelection.resolveLesson(LESSONS, null, "2026-08-01");
    expect(resolution.lesson).toBe("2026-09-01");
    expect(resolution.source).toBe("first");
  });

  it.each(["2026-09-02", "garbage", "2026-9-8", ""])(
    "treats the unscheduled lesson query %j as invalid and falls back",
    (raw) => {
      const resolution = JournalWorkspaceSelection.resolveLesson(LESSONS, raw, "2026-09-17");
      expect(resolution.queryInvalid).toBe(true);
      expect(resolution.lesson).toBe("2026-09-15");
    },
  );

  it("uses only the returned lesson dates and never invents one", () => {
    const resolution = JournalWorkspaceSelection.resolveLesson([], "2026-09-01", "2026-09-01");
    expect(resolution.lesson).toBeUndefined();
    expect(resolution.queryInvalid).toBe(true);
  });

  it("stops previous and next at the period boundary instead of crossing it", () => {
    expect(JournalWorkspaceSelection.neighbourLesson(LESSONS, "2026-09-01", -1)).toBeUndefined();
    expect(JournalWorkspaceSelection.neighbourLesson(LESSONS, "2026-09-22", 1)).toBeUndefined();
    expect(JournalWorkspaceSelection.neighbourLesson(LESSONS, "2026-09-08", -1)).toBe("2026-09-01");
    expect(JournalWorkspaceSelection.neighbourLesson(LESSONS, "2026-09-08", 1)).toBe("2026-09-15");
  });

  it("returns no neighbour when nothing is selected or the selection is not a lesson", () => {
    expect(JournalWorkspaceSelection.neighbourLesson(LESSONS, undefined, 1)).toBeUndefined();
    expect(JournalWorkspaceSelection.neighbourLesson(LESSONS, "2026-09-02", 1)).toBeUndefined();
  });
});

describe("tab and view parsing", () => {
  it("defaults to the gradebook grid and flags unknown values", () => {
    expect(JournalWorkspaceSelection.parseTab(null)).toEqual({ tab: "gradebook", queryInvalid: false });
    expect(JournalWorkspaceSelection.parseTab("progress")).toEqual({ tab: "progress", queryInvalid: false });
    expect(JournalWorkspaceSelection.parseTab("nonsense")).toEqual({ tab: "gradebook", queryInvalid: true });
    expect(JournalWorkspaceSelection.parseView(null)).toEqual({ view: "grid", queryInvalid: false });
    expect(JournalWorkspaceSelection.parseView("summary")).toEqual({ view: "summary", queryInvalid: false });
    expect(JournalWorkspaceSelection.parseView("table")).toEqual({ view: "grid", queryInvalid: true });
  });
});

describe("drain boundary", () => {
  function location(pathname: string, search: string): Location {
    return { pathname, search, hash: "", state: null, key: "k" };
  }

  it("crosses the boundary when the period changes or the route leaves the journal", () => {
    expect(
      JournalWorkspaceSelection.changesJournalContext({
        currentLocation: location("/journals/5", "?period=10"),
        nextLocation: location("/journals/5", "?period=20"),
      }),
    ).toBe(true);
    expect(
      JournalWorkspaceSelection.changesJournalContext({
        currentLocation: location("/journals/5", "?period=10"),
        nextLocation: location("/journals", ""),
      }),
    ).toBe(true);
    expect(
      JournalWorkspaceSelection.changesJournalContext({
        currentLocation: location("/journals/5", "?period=10"),
        nextLocation: location("/journals/6", "?period=10"),
      }),
    ).toBe(true);
  });

  it("does not cross the boundary for lesson, tab or view changes in the same period", () => {
    expect(
      JournalWorkspaceSelection.changesJournalContext({
        currentLocation: location("/journals/5", "?period=10&lesson=2026-08-01"),
        nextLocation: location("/journals/5", "?period=10&lesson=2026-08-02&view=summary&tab=progress"),
      }),
    ).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import type { GradingQueueItemResponse } from "./types";

function buildJournalDeepLink(courseId: number, journalId: number): string {
  return `/journals/${courseId}?period=${journalId}`;
}

function sortGradingQueue(items: GradingQueueItemResponse[]): GradingQueueItemResponse[] {
  return [...items].sort((a, b) => {
    if (a.is_current !== b.is_current) {
      return a.is_current ? -1 : 1;
    }
    return new Date(b.period_end).getTime() - new Date(a.period_end).getTime();
  });
}

describe("Grading Queue Utilities", () => {
  it("builds correct period deep-link query string", () => {
    expect(buildJournalDeepLink(12, 105)).toBe("/journals/12?period=105");
  });

  it("prioritizes current periods first in the grading queue", () => {
    const queue: GradingQueueItemResponse[] = [
      {
        journal_id: 1,
        course_id: 10,
        course_title: "Course A",
        period_label: "Week 1",
        period_start: "2026-01-01",
        period_end: "2026-01-07",
        state: "partial",
        cells_filled: 5,
        cells_expected: 10,
        is_current: false,
      },
      {
        journal_id: 2,
        course_id: 10,
        course_title: "Course A",
        period_label: "Week 2",
        period_start: "2026-01-08",
        period_end: "2026-01-14",
        state: "empty",
        cells_filled: 0,
        cells_expected: 10,
        is_current: true,
      },
    ];

    const sorted = sortGradingQueue(queue);
    expect(sorted[0].journal_id).toBe(2);
    expect(sorted[0].is_current).toBe(true);
  });
});

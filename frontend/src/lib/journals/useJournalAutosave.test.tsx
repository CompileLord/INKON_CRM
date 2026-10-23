import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useJournalAutosave } from "./useJournalAutosave";
import * as endpoints from "./endpoints";
import { AuthApiError } from "../auth/errors";
import type { JournalDetailResponse } from "./types";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("./endpoints", () => ({
  batchUpdateJournalEntries: vi.fn(),
  updateJournalStudentSummary: vi.fn(),
  getJournal: vi.fn(),
}));

describe("useJournalAutosave", () => {
  let queryClient: QueryClient;
  let container: HTMLDivElement;
  let root: Root;
  let hookResult: ReturnType<typeof useJournalAutosave>;

  function TestComponent({ journalId, courseId }: { journalId: number; courseId: number }) {
    hookResult = useJournalAutosave(journalId, courseId);
    return null;
  }

  function mountHook(journalId = 1, courseId = 10) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    queryClient.setQueryData(["journals", "detail", journalId], {
      journal_id: journalId,
      course_id: courseId,
      period_label: "Week 1",
      period_start: "2026-08-01",
      period_end: "2026-08-07",
      period_type: "week",
      exam_max_score: 100,
      lesson_dates: ["2026-08-01", "2026-08-02"],
      students: [
        {
          student_id: 101,
          first_name: "Student",
          last_name: "One",
          email: "s1@example.com",
          color_hex: "#000",
          entries: [
            { id: 1, lesson_date: "2026-08-01", attendance: false, score: 0, comment: null, has_comment: false, is_graded: false, version: 1 },
            { id: 2, lesson_date: "2026-08-02", attendance: false, score: 0, comment: null, has_comment: false, is_graded: false, version: 1 },
          ],
          summary: { id: 1, bonus_score: 0, exam_score: 0, version: 1, homework_score: 0, attendance_score: 0, sum_score: 0, max_period_score: 100, percentage: 0, attendance_count: 0, total_lessons: 2 },
        },
        {
          student_id: 102,
          first_name: "Student",
          last_name: "Two",
          email: "s2@example.com",
          color_hex: "#000",
          entries: [
            { id: 3, lesson_date: "2026-08-01", attendance: false, score: 0, comment: null, has_comment: false, is_graded: false, version: 1 },
          ],
          summary: { id: 2, bonus_score: 0, exam_score: 0, version: 1, homework_score: 0, attendance_score: 0, sum_score: 0, max_period_score: 100, percentage: 0, attendance_count: 0, total_lessons: 1 },
        },
      ],
    });

    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <TestComponent journalId={journalId} courseId={courseId} />
        </QueryClientProvider>
      );
    });
  }

  function unmountHook() {
    if (root) {
      act(() => {
        root.unmount();
      });
    }
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    unmountHook();
    vi.useRealTimers();
  });

  it("coalesces multiple edits within debounce window into a single request", async () => {
    const batchMock = vi.mocked(endpoints.batchUpdateJournalEntries).mockResolvedValue({
      applied: [
        { student_id: 101, lesson_date: "2026-08-01", attendance: true, score: 5, comment: null, version: 2 },
        { student_id: 101, lesson_date: "2026-08-02", attendance: true, score: 4, comment: null, version: 2 },
      ],
      conflicts: [],
      summaries: [],
    });

    mountHook();

    act(() => {
      hookResult.editEntry("101:2026-08-01", {
        student_id: 101,
        lesson_date: "2026-08-01",
        attendance: true,
        score: 5,
        version: 1,
      });
      hookResult.editEntry("101:2026-08-02", {
        student_id: 101,
        lesson_date: "2026-08-02",
        attendance: true,
        score: 4,
        version: 1,
      });
    });

    expect(batchMock).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(750);
    });

    expect(batchMock).toHaveBeenCalledTimes(1);
    expect(batchMock).toHaveBeenCalledWith(1, expect.arrayContaining([
      expect.objectContaining({ lesson_date: "2026-08-01", score: 5 }),
      expect.objectContaining({ lesson_date: "2026-08-02", score: 4 }),
    ]));
  });

  it("preserves rejected local snapshot on mixed 200 batch conflict and avoids replaying applied sibling", async () => {
    const batchMock = vi.mocked(endpoints.batchUpdateJournalEntries).mockResolvedValueOnce({
      applied: [
        { student_id: 101, lesson_date: "2026-08-01", attendance: true, score: 5, comment: "Applied comment", version: 2 },
      ],
      conflicts: [
        {
          student_id: 102,
          lesson_date: "2026-08-01",
          submitted_version: 1,
          current: {
            student_id: 102,
            lesson_date: "2026-08-01",
            attendance: true,
            score: 2,
            comment: "Remote comment",
            version: 3,
          },
        },
      ],
      summaries: [],
    });

    mountHook();

    act(() => {
      hookResult.editEntry("101:2026-08-01", {
        student_id: 101,
        lesson_date: "2026-08-01",
        attendance: true,
        score: 5,
        comment: "Applied comment",
        version: 1,
      });
      hookResult.editEntry("102:2026-08-01", {
        student_id: 102,
        lesson_date: "2026-08-01",
        attendance: true,
        score: 4,
        comment: "My local draft comment",
        version: 1,
      });
    });

    await act(async () => {
      vi.advanceTimersByTime(750);
    });

    expect(batchMock).toHaveBeenCalledTimes(1);
    expect(hookResult.conflicts).toHaveLength(1);
    expect(hookResult.conflicts[0].student_id).toBe(102);
    expect(hookResult.cellStatus.get("101:2026-08-01")).toBe("saved");
    expect(hookResult.cellStatus.get("102:2026-08-01")).toBe("conflict");

    const cachedData = queryClient.getQueryData<JournalDetailResponse>(["journals", "detail", 1]);
    const student102Entry = cachedData?.students.find((s) => s.student_id === 102)?.entries.find((e) => e.lesson_date === "2026-08-01");
    expect(student102Entry?.score).toBe(4);
    expect(student102Entry?.comment).toBe("My local draft comment");

    batchMock.mockResolvedValueOnce({
      applied: [
        { student_id: 102, lesson_date: "2026-08-01", attendance: true, score: 4, comment: "My local draft comment", version: 4 },
      ],
      conflicts: [],
      summaries: [],
    });

    act(() => {
      hookResult.resolveConflict(hookResult.conflicts[0], "keepMine");
    });

    await act(async () => {
      vi.advanceTimersByTime(750);
    });

    expect(batchMock).toHaveBeenCalledTimes(2);
    expect(batchMock).toHaveBeenNthCalledWith(2, 1, [
      expect.objectContaining({
        student_id: 102,
        lesson_date: "2026-08-01",
        score: 4,
        comment: "My local draft comment",
        version: 3,
      }),
    ]);
  });

  it("mixed conflict keepTheirs discards only the conflicting draft and updates cache", async () => {
    vi.mocked(endpoints.batchUpdateJournalEntries).mockResolvedValueOnce({
      applied: [
        { student_id: 101, lesson_date: "2026-08-01", attendance: true, score: 5, comment: null, version: 2 },
      ],
      conflicts: [
        {
          student_id: 102,
          lesson_date: "2026-08-01",
          submitted_version: 1,
          current: {
            student_id: 102,
            lesson_date: "2026-08-01",
            attendance: true,
            score: 2,
            comment: "Server value",
            version: 3,
          },
        },
      ],
      summaries: [],
    });

    mountHook();

    act(() => {
      hookResult.editEntry("101:2026-08-01", {
        student_id: 101,
        lesson_date: "2026-08-01",
        attendance: true,
        score: 5,
        version: 1,
      });
      hookResult.editEntry("102:2026-08-01", {
        student_id: 102,
        lesson_date: "2026-08-01",
        attendance: true,
        score: 4,
        version: 1,
      });
    });

    await act(async () => {
      vi.advanceTimersByTime(750);
    });

    expect(hookResult.conflicts).toHaveLength(1);

    act(() => {
      hookResult.resolveConflict(hookResult.conflicts[0], "keepTheirs");
    });

    expect(hookResult.conflicts).toHaveLength(0);
    expect(hookResult.cellStatus.get("102:2026-08-01")).toBeUndefined();
    expect(hookResult.hasPendingEdits).toBe(false);
    expect(hookResult.aggregateStatus).toBe("idle");

    const cachedData = queryClient.getQueryData<JournalDetailResponse>(["journals", "detail", 1]);
    const student102Entry = cachedData?.students.find((s) => s.student_id === 102)?.entries.find((e) => e.lesson_date === "2026-08-01");
    expect(student102Entry?.score).toBe(2);
    expect(student102Entry?.comment).toBe("Server value");
    expect(student102Entry?.version).toBe(3);
  });

  it("actual AuthApiError 409 causes exactly 1 request even after all retry deadlines and leaves status non-saved", async () => {
    const batchMock = vi.mocked(endpoints.batchUpdateJournalEntries).mockRejectedValue(
      new AuthApiError(409, "Conflict: The journal entries have been updated by another user. Please refresh and try again.")
    );

    mountHook();

    act(() => {
      hookResult.editEntry("101:2026-08-01", {
        student_id: 101,
        lesson_date: "2026-08-01",
        attendance: true,
        score: 5,
        version: 1,
      });
    });

    await act(async () => {
      vi.advanceTimersByTime(750);
    });

    expect(batchMock).toHaveBeenCalledTimes(1);
    expect(hookResult.cellStatus.get("101:2026-08-01")).toBe("conflict");
    expect(hookResult.aggregateStatus).toBe("error");
    expect(hookResult.aggregateStatus).not.toBe("saved");

    await act(async () => {
      vi.advanceTimersByTime(15000);
    });

    expect(batchMock).toHaveBeenCalledTimes(1);
    expect(hookResult.aggregateStatus).toBe("error");
  });

  it("generic 409 sets current to undefined and prevents premature keepMine before authoritative fetch", async () => {
    vi.mocked(endpoints.batchUpdateJournalEntries).mockRejectedValue(
      new AuthApiError(409, "Conflict: Generic mismatch")
    );

    mountHook();

    act(() => {
      hookResult.editEntry("101:2026-08-01", {
        student_id: 101,
        lesson_date: "2026-08-01",
        attendance: true,
        score: 4,
        version: 1,
      });
    });

    await act(async () => {
      vi.advanceTimersByTime(750);
    });

    expect(hookResult.conflicts).toHaveLength(1);
    expect(hookResult.conflicts[0].current).toBeUndefined();

    act(() => {
      hookResult.resolveConflict(hookResult.conflicts[0], "keepMine");
    });
    expect(hookResult.conflicts).toHaveLength(1);

    act(() => {
      hookResult.resolveConflict(hookResult.conflicts[0], "keepTheirs");
    });
    expect(hookResult.conflicts).toHaveLength(1);
    expect(hookResult.hasPendingEdits).toBe(true);

    const cacheBeforeRefresh = queryClient.getQueryData<JournalDetailResponse>(["journals", "detail", 1]);
    expect(cacheBeforeRefresh?.students[0].entries).toHaveLength(2);

    vi.mocked(endpoints.getJournal).mockResolvedValueOnce({
      journal_id: 1,
      course_id: 10,
      period_label: "Week 1",
      period_start: "2026-08-01",
      period_end: "2026-08-07",
      period_type: "week",
      exam_max_score: 100,
      lesson_dates: ["2026-08-01"],
      students: [
        {
          student_id: 101,
          first_name: "Student",
          last_name: "One",
          email: "s1@example.com",
          color_hex: "#000",
          entries: [
            { id: 1, lesson_date: "2026-08-01", attendance: true, score: 2, comment: null, has_comment: false, is_graded: true, version: 2 },
          ],
          summary: null,
        },
      ],
    });

    await act(async () => {
      await hookResult.retryManual();
    });

    expect(hookResult.conflicts).toHaveLength(1);
    expect(hookResult.conflicts[0].current?.version).toBe(2);

    act(() => {
      hookResult.resolveConflict(hookResult.conflicts[0], "keepTheirs");
    });

    expect(hookResult.conflicts).toHaveLength(0);
    expect(hookResult.hasPendingEdits).toBe(false);
    expect(hookResult.aggregateStatus).toBe("idle");

    const cachedData = queryClient.getQueryData<JournalDetailResponse>(["journals", "detail", 1]);
    const cachedEntry = cachedData?.students[0].entries[0];
    expect(cachedEntry?.score).toBe(2);
    expect(cachedEntry?.version).toBe(2);
  });

  it("same-owner newer local entry and summary retained under failed request", async () => {
    let rejectPromise: ((reason?: unknown) => void) | undefined;
    const pendingPromise = new Promise<never>((_, reject) => {
      rejectPromise = reject;
    });

    vi.mocked(endpoints.batchUpdateJournalEntries).mockReturnValue(pendingPromise);

    mountHook();

    act(() => {
      hookResult.editEntry("101:2026-08-01", {
        student_id: 101,
        lesson_date: "2026-08-01",
        attendance: true,
        score: 2,
        version: 1,
      });
    });

    await act(async () => {
      vi.advanceTimersByTime(750);
    });

    act(() => {
      hookResult.editEntry("101:2026-08-01", {
        student_id: 101,
        lesson_date: "2026-08-01",
        attendance: true,
        score: 5,
        version: 1,
      });
      hookResult.editSummary(101, {
        bonus_score: 10,
        exam_score: 20,
        version: 1,
      });
    });

    await act(async () => {
      rejectPromise?.(new AuthApiError(409, "Conflict: Stale version"));
    });

    expect(hookResult.aggregateStatus).toBe("error");
    expect(hookResult.cellStatus.get("101:2026-08-01")).toBe("dirty");
    expect(hookResult.hasPendingEdits).toBe(true);
  });
});

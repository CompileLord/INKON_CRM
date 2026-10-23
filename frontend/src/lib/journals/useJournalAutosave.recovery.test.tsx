import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useJournalAutosave } from "./useJournalAutosave";
import * as endpoints from "./endpoints";
import { AuthApiError } from "../auth/errors";
import type { JournalBatchUpdateResponse, JournalDetailResponse } from "./types";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("./endpoints", () => ({
  batchUpdateJournalEntries: vi.fn(),
  updateJournalStudentSummary: vi.fn(),
  getJournal: vi.fn(),
}));

describe("useJournalAutosave recovery", () => {
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

  it("retains an unacknowledged draft without automatically replaying a successful response", async () => {
    const batchMock = vi.mocked(endpoints.batchUpdateJournalEntries).mockResolvedValue({
      applied: [], conflicts: [], summaries: [],
    });
    mountHook();
    act(() => hookResult.editEntry("101:2026-08-01", {
      student_id: 101, lesson_date: "2026-08-01", attendance: true, score: 5, version: 1,
    }));
    await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
    expect(batchMock).toHaveBeenCalledTimes(1);
    expect(hookResult.hasPendingEdits).toBe(true);
    expect(hookResult.aggregateStatus).toBe("error");
    expect(hookResult.cellStatus.get("101:2026-08-01")).toBe("error");
  });

  it("does not invalidate journal detail query during save", async () => {
    vi.mocked(endpoints.batchUpdateJournalEntries).mockResolvedValue({
      applied: [{ student_id: 101, lesson_date: "2026-08-01", attendance: true, score: 5, version: 2 }],
      conflicts: [],
      summaries: [],
    });

    mountHook();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

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

    const calls = invalidateSpy.mock.calls.map((c) => c[0]);
    const journalDetailInvalidated = calls.some(
      (opt: unknown) => {
        const queryKey = (opt as { queryKey?: string[] })?.queryKey;
        return queryKey?.[0] === "journals" && queryKey?.[1] === "detail";
      }
    );
    expect(journalDetailInvalidated).toBe(false);
  });

  it("paired summary keepTheirs restores authoritative bonus exam and derived totals with zero extra patch calls", async () => {
    const summaryMock = vi.mocked(endpoints.updateJournalStudentSummary).mockRejectedValueOnce(
      new AuthApiError(409, "Conflict: summary version mismatch")
    );

    mountHook();

    act(() => {
      hookResult.editSummary(101, {
        bonus_score: 4,
        exam_score: 50,
        version: 1,
      });
    });

    await act(async () => {
      vi.advanceTimersByTime(750);
    });

    expect(summaryMock).toHaveBeenCalledTimes(1);
    expect(hookResult.conflicts).toHaveLength(1);

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
          entries: [],
          summary: {
            id: 1,
            bonus_score: 9,
            exam_score: 30,
            version: 2,
            homework_score: 0,
            attendance_score: 0,
            sum_score: 39,
            max_period_score: 100,
            percentage: 39,
            attendance_count: 0,
            total_lessons: 1,
          },
        },
      ],
    });

    await act(async () => {
      await hookResult.retryManual();
    });

    expect(hookResult.conflicts).toHaveLength(1);
    expect(hookResult.conflicts[0].type).toBe("summary");
    if (hookResult.conflicts[0].type === "summary") {
      expect(hookResult.conflicts[0].current?.bonus_score).toBe(9);
      expect(hookResult.conflicts[0].current?.exam_score).toBe(30);
    }

    act(() => {
      hookResult.resolveConflict(hookResult.conflicts[0], "keepTheirs");
    });

    expect(hookResult.conflicts).toHaveLength(0);
    expect(hookResult.hasPendingEdits).toBe(false);
    expect(hookResult.aggregateStatus).toBe("idle");

    const cachedData = queryClient.getQueryData<JournalDetailResponse>(["journals", "detail", 1]);
    const summary = cachedData?.students[0].summary;
    expect(summary?.bonus_score).toBe(9);
    expect(summary?.exam_score).toBe(30);
    expect(summary?.sum_score).toBe(39);
    expect(summary?.percentage).toBe(39);
    expect(summary?.version).toBe(2);

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    expect(summaryMock).toHaveBeenCalledTimes(1);
  });

  it("missing summary discard removes optimistic paired values and restores null summary in cache", async () => {
    const summaryMock = vi.mocked(endpoints.updateJournalStudentSummary).mockRejectedValueOnce(
      new AuthApiError(409, "Conflict: summary not found")
    );

    mountHook();

    act(() => {
      hookResult.editSummary(101, {
        bonus_score: 4,
        exam_score: 50,
        version: 1,
      });
    });

    await act(async () => {
      vi.advanceTimersByTime(750);
    });

    expect(summaryMock).toHaveBeenCalledTimes(1);
    expect(hookResult.conflicts).toHaveLength(1);

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
          entries: [],
          summary: null,
        },
      ],
    });

    await act(async () => {
      await hookResult.retryManual();
    });

    expect(hookResult.conflicts).toHaveLength(1);
    expect(hookResult.conflicts[0].current).toBeNull();

    act(() => {
      hookResult.resolveConflict(hookResult.conflicts[0], "keepTheirs");
    });

    expect(hookResult.conflicts).toHaveLength(0);
    expect(hookResult.hasPendingEdits).toBe(false);
    expect(hookResult.aggregateStatus).toBe("idle");

    const cachedData = queryClient.getQueryData<JournalDetailResponse>(["journals", "detail", 1]);
    expect(cachedData?.students[0].summary).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    expect(summaryMock).toHaveBeenCalledTimes(1);
  });

  it("deferred identical conflict preserves newer local edit and resubmits with updated server version", async () => {
    let resolveBatch: (value: JournalBatchUpdateResponse) => void = () => {};
    const batchPromise = new Promise<JournalBatchUpdateResponse>((resolve) => {
      resolveBatch = resolve;
    });

    const batchMock = vi.mocked(endpoints.batchUpdateJournalEntries)
      .mockReturnValueOnce(batchPromise)
      .mockResolvedValueOnce({
        applied: [
          { student_id: 101, lesson_date: "2026-08-01", attendance: true, score: 5, comment: null, version: 3 },
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
        score: 3,
        version: 1,
      });
    });

    await act(async () => {
      vi.advanceTimersByTime(750);
    });

    expect(batchMock).toHaveBeenCalledTimes(1);
    expect(batchMock).toHaveBeenNthCalledWith(1, 1, [
      expect.objectContaining({ score: 3, version: 1 }),
    ]);

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
      resolveBatch({
        applied: [],
        conflicts: [
          {
            student_id: 101,
            lesson_date: "2026-08-01",
            submitted_version: 1,
            current: {
              student_id: 101,
              lesson_date: "2026-08-01",
              attendance: true,
              score: 3,
              comment: null,
              version: 2,
            },
          },
        ],
        summaries: [],
      });
    });

    const cachedData = queryClient.getQueryData<JournalDetailResponse>(["journals", "detail", 1]);
    const student101Entry = cachedData?.students[0].entries.find((e) => e.lesson_date === "2026-08-01");
    expect(student101Entry?.score).toBe(5);

    await act(async () => {
      vi.advanceTimersByTime(750);
    });

    expect(batchMock).toHaveBeenCalledTimes(2);
    expect(batchMock).toHaveBeenNthCalledWith(2, 1, [
      expect.objectContaining({ score: 5, version: 2 }),
    ]);
  });

  it("deferred applied response preserves newer local edit and resubmits with updated server version", async () => {
    let resolveBatch: (value: JournalBatchUpdateResponse) => void = () => {};
    const batchPromise = new Promise<JournalBatchUpdateResponse>((resolve) => {
      resolveBatch = resolve;
    });

    const batchMock = vi.mocked(endpoints.batchUpdateJournalEntries)
      .mockReturnValueOnce(batchPromise)
      .mockResolvedValueOnce({
        applied: [
          { student_id: 101, lesson_date: "2026-08-01", attendance: true, score: 5, comment: null, version: 3 },
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
        score: 3,
        version: 1,
      });
    });

    await act(async () => {
      vi.advanceTimersByTime(750);
    });

    expect(batchMock).toHaveBeenCalledTimes(1);

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
      resolveBatch({
        applied: [
          {
            student_id: 101,
            lesson_date: "2026-08-01",
            attendance: true,
            score: 3,
            comment: null,
            version: 2,
          },
        ],
        conflicts: [],
        summaries: [],
      });
    });

    const cachedData = queryClient.getQueryData<JournalDetailResponse>(["journals", "detail", 1]);
    const student101Entry = cachedData?.students[0].entries.find((e) => e.lesson_date === "2026-08-01");
    expect(student101Entry?.score).toBe(5);

    await act(async () => {
      vi.advanceTimersByTime(750);
    });

    expect(batchMock).toHaveBeenCalledTimes(2);
    expect(batchMock).toHaveBeenNthCalledWith(2, 1, [
      expect.objectContaining({ score: 5, version: 2 }),
    ]);
  });

  it("discard preserves pending status and schedules save when other drafts remain", async () => {
    const batchMock = vi.mocked(endpoints.batchUpdateJournalEntries)
      .mockResolvedValueOnce({
        applied: [],
        conflicts: [
          {
            student_id: 101,
            lesson_date: "2026-08-01",
            submitted_version: 1,
            current: {
              student_id: 101,
              lesson_date: "2026-08-01",
              attendance: true,
              score: 2,
              comment: null,
              version: 2,
            },
          },
        ],
        summaries: [],
      })
      .mockResolvedValueOnce({
        applied: [
          { student_id: 102, lesson_date: "2026-08-01", attendance: true, score: 4, comment: null, version: 2 },
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
    expect(hookResult.aggregateStatus).toBe("error");

    act(() => {
      hookResult.resolveConflict(hookResult.conflicts[0], "keepTheirs");
    });

    expect(hookResult.conflicts).toHaveLength(0);
    expect(hookResult.hasPendingEdits).toBe(true);
    expect(hookResult.aggregateStatus).toBe("pending");

    await act(async () => {
      vi.advanceTimersByTime(750);
    });

    expect(batchMock).toHaveBeenCalledTimes(2);
    expect(batchMock).toHaveBeenNthCalledWith(2, 1, [
      expect.objectContaining({ student_id: 102, score: 4, version: 1 }),
    ]);
    expect(hookResult.hasPendingEdits).toBe(false);
  });
});

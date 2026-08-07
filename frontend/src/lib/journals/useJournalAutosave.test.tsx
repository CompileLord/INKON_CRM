import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useJournalAutosave } from "./useJournalAutosave";
import * as endpoints from "./endpoints";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("./endpoints", () => ({
  batchUpdateJournalEntries: vi.fn(),
  updateJournalStudentSummary: vi.fn(),
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
      students: [
        {
          student_id: 101,
          entries: [{ lesson_date: "2026-08-01", attendance: false, score: 0, version: 1 }],
          summary: { bonus_score: 0, exam_score: 0, version: 1 },
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

  it("handles conflicts by updating cache with server state and flagging cell", async () => {
    vi.mocked(endpoints.batchUpdateJournalEntries).mockResolvedValue({
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
            version: 2,
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
    });

    await act(async () => {
      vi.advanceTimersByTime(750);
    });

    expect(hookResult.cellStatus.get("101:2026-08-01")).toBe("conflict");
    expect(hookResult.conflicts).toHaveLength(1);
  });

  it("does not invalidate journal detail query during save", async () => {
    vi.mocked(endpoints.batchUpdateJournalEntries).mockResolvedValue({
      applied: [],
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
      (opt: any) => opt?.queryKey?.[0] === "journals" && opt?.queryKey?.[1] === "detail"
    );
    expect(journalDetailInvalidated).toBe(false);
  });
});

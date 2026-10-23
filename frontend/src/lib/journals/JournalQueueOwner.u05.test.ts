import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QueryClient } from "@tanstack/react-query";
import { AuthApiError } from "../auth/errors";
import { JournalQueueOwner } from "./JournalQueueOwner";
import { FIRST_DATE, buildDetail, createFakeApi, createQueryClientWith, type FakeJournalApi } from "./journalQueueTestSupport";
import type { JournalDetailResponse, JournalCellRejectionDetail } from "./types";

function rejectionError(detail: JournalCellRejectionDetail): AuthApiError {
  const error: AuthApiError = new AuthApiError(422, undefined);
  Object.defineProperty(error, "detail", { value: detail });
  return error;
}

describe("JournalQueueOwner server cell rejections and conflict loading", () => {
  let api: FakeJournalApi;
  let queryClient: QueryClient;
  let owner: JournalQueueOwner;

  beforeEach(() => {
    vi.useFakeTimers();
    api = createFakeApi();
    queryClient = createQueryClientWith(buildDetail());
    owner = new JournalQueueOwner(1, 10, queryClient, api);
  });

  afterEach(() => {
    owner.dispose();
    vi.useRealTimers();
  });

  it("marks the cells listed in a 422 detail with their code and keeps the typed draft", async () => {
    api.batchUpdate.mockRejectedValueOnce(
      rejectionError({
        code: "future_lesson",
        message: "Some journal cells cannot be updated",
        cells: [{ student_id: 101, lesson_date: FIRST_DATE, code: "future_lesson" }],
      }),
    );
    owner.applyEntryCommand(101, FIRST_DATE, { kind: "score", score: 4 });
    await vi.advanceTimersByTimeAsync(750);

    const snapshot = owner.getSnapshot();
    expect(snapshot.cellRejections.get(`101:${FIRST_DATE}`)).toBe("future_lesson");
    expect(snapshot.cellStatus.get(`101:${FIRST_DATE}`)).toBe("error");
    const detail: JournalDetailResponse = queryClient.getQueryData(["journals", "detail", 1]) as JournalDetailResponse;
    const entry = detail.students[0].entries.find((candidate) => candidate.lesson_date === FIRST_DATE);
    expect(entry?.score).toBe(4);
  });

  it("does not resend a rejected cell, so other cells still save, and clears the rejection on the next edit", async () => {
    api.batchUpdate.mockRejectedValueOnce(
      rejectionError({
        code: "future_lesson",
        message: "Some journal cells cannot be updated",
        cells: [{ student_id: 101, lesson_date: FIRST_DATE, code: "future_lesson" }],
      }),
    );
    owner.applyEntryCommand(101, FIRST_DATE, { kind: "score", score: 4 });
    await vi.advanceTimersByTimeAsync(750);

    api.batchUpdate.mockResolvedValueOnce({
      applied: [{ student_id: 102, lesson_date: FIRST_DATE, attendance: true, score: 3, comment: null, is_graded: true, version: 2 }],
      conflicts: [],
      summaries: [],
    });
    owner.applyEntryCommand(102, FIRST_DATE, { kind: "score", score: 3 });
    await vi.advanceTimersByTimeAsync(750);
    expect(api.batchUpdate.mock.calls[1][1]).toEqual([expect.objectContaining({ student_id: 102 })]);

    owner.applyEntryCommand(101, FIRST_DATE, { kind: "score", score: 5 });
    expect(owner.getSnapshot().cellRejections.has(`101:${FIRST_DATE}`)).toBe(false);
  });

  it("marks the cell graded in the grid cache as soon as a score is staged", () => {
    const beforeDetail: JournalDetailResponse = queryClient.getQueryData(["journals", "detail", 1]) as JournalDetailResponse;
    expect(beforeDetail.students[0].entries[0].is_graded).toBe(false);
    owner.applyEntryCommand(101, FIRST_DATE, { kind: "score", score: 0 });
    const afterDetail: JournalDetailResponse = queryClient.getQueryData(["journals", "detail", 1]) as JournalDetailResponse;
    const gradedZero = afterDetail.students[0].entries.find((candidate) => candidate.lesson_date === FIRST_DATE);
    expect(gradedZero?.is_graded).toBe(true);
    expect(gradedZero?.score).toBe(0);
  });

  it("loads the current server value by itself after a whole-batch 409 so the dialog needs no manual refetch", async () => {
    api.batchUpdate.mockRejectedValueOnce(new AuthApiError(409, "Conflict: updated by another user"));
    const serverDetail: JournalDetailResponse = buildDetail();
    serverDetail.students[0].entries[0] = { ...serverDetail.students[0].entries[0], score: 2, attendance: true, is_graded: true, version: 5 };
    api.fetchJournal.mockResolvedValueOnce(serverDetail);

    owner.applyEntryCommand(101, FIRST_DATE, { kind: "score", score: 5 });
    await vi.advanceTimersByTimeAsync(750);

    expect(api.fetchJournal).toHaveBeenCalledTimes(1);
    const conflict = owner.getSnapshot().conflicts[0];
    expect(conflict.type).toBe("entry");
    expect(conflict.current).toEqual(expect.objectContaining({ score: 2, version: 5 }));
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QueryClient } from "@tanstack/react-query";
import { AuthApiError, NetworkError } from "../auth/errors";
import { JournalQueueOwner } from "./JournalQueueOwner";
import {
  FIRST_DATE,
  SECOND_DATE,
  appliedResponse,
  buildDetail,
  createDeferred,
  createFakeApi,
  createQueryClientWith,
  stateOf,
  summaryResult,
  type FakeJournalApi,
} from "./journalQueueTestSupport";
import type { JournalBatchUpdateResponse, JournalDetailResponse } from "./types";

describe("JournalQueueOwner", () => {
  let api: FakeJournalApi;
  let queryClient: QueryClient;
  let owner: JournalQueueOwner;

  function cachedDetail(journalId: number = 1): JournalDetailResponse {
    return queryClient.getQueryData<JournalDetailResponse>(["journals", "detail", journalId]) as JournalDetailResponse;
  }

  function cachedEntry(studentId: number, lessonDate: string = FIRST_DATE) {
    return cachedDetail()
      .students.find((student) => student.student_id === studentId)
      ?.entries.find((entry) => entry.lesson_date === lessonDate);
  }

  function cachedSummary(studentId: number) {
    return cachedDetail().students.find((student) => student.student_id === studentId)?.summary;
  }

  function serverDetail(mutate: (detail: JournalDetailResponse) => void): JournalDetailResponse {
    const detail: JournalDetailResponse = buildDetail();
    mutate(detail);
    return detail;
  }

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

  describe("canonical edit commands", () => {
    async function absencePayloadAfterGrading(
      commandSequence: Array<{ kind: "attendance"; attended: boolean }>,
    ): Promise<unknown> {
      const sequenceQueryClient = createQueryClientWith(buildDetail());
      const sequenceApi = createFakeApi();
      sequenceApi.batchUpdate
        .mockResolvedValueOnce(appliedResponse(stateOf(101, FIRST_DATE, { attendance: true, score: 4, version: 2 })))
        .mockResolvedValueOnce(appliedResponse(stateOf(101, FIRST_DATE, { attendance: false, score: 0, version: 3 })));
      const sequenceOwner = new JournalQueueOwner(1, 10, sequenceQueryClient, sequenceApi);
      sequenceOwner.applyEntryCommand(101, FIRST_DATE, { kind: "score", score: 4 });
      await vi.advanceTimersByTimeAsync(750);
      commandSequence.forEach((command) => sequenceOwner.applyEntryCommand(101, FIRST_DATE, command));
      await vi.advanceTimersByTimeAsync(750);
      sequenceOwner.dispose();
      return sequenceApi.batchUpdate.mock.calls[1][1];
    }

    it("sends identical absence payloads for the Space key and the attendance checkbox", async () => {
      const spacePayload = await absencePayloadAfterGrading([{ kind: "attendance", attended: false }]);
      const checkboxPayload = await absencePayloadAfterGrading([{ kind: "attendance", attended: false }]);
      expect(spacePayload).toEqual(checkboxPayload);
      expect(spacePayload).toEqual([
        expect.objectContaining({ student_id: 101, lesson_date: FIRST_DATE, attendance: false, score: 0, comment: null, version: 2 }),
      ]);
    });

    it("keeps the current comment when a grade or attendance changes", async () => {
      api.batchUpdate.mockResolvedValue(appliedResponse(stateOf(101, FIRST_DATE, { attendance: true, score: 5, comment: "Great", version: 3 })));
      owner.applyEntryCommand(101, FIRST_DATE, { kind: "comment", comment: "  Great  " });
      owner.applyEntryCommand(101, FIRST_DATE, { kind: "score", score: 5 });
      await vi.advanceTimersByTimeAsync(750);

      expect(api.batchUpdate).toHaveBeenCalledTimes(1);
      expect(api.batchUpdate.mock.calls[0][1]).toEqual([
        expect.objectContaining({ attendance: true, score: 5, comment: "Great" }),
      ]);
      expect(cachedEntry(101)?.comment).toBe("Great");
    });

    it("clears the comment with an empty save and sends null", async () => {
      api.batchUpdate.mockResolvedValue(appliedResponse(stateOf(101, FIRST_DATE, { comment: null })));
      owner.applyEntryCommand(101, FIRST_DATE, { kind: "comment", comment: "Note" });
      owner.applyEntryCommand(101, FIRST_DATE, { kind: "comment", comment: "   " });
      await vi.advanceTimersByTimeAsync(750);
      expect(api.batchUpdate).not.toHaveBeenCalled();
      expect(cachedEntry(101)?.comment).toBeNull();
    });
  });

  describe("drain boundary", () => {
    it("does not resolve while a slow request is in flight and resolves acknowledged afterwards", async () => {
      const slow = createDeferred<JournalBatchUpdateResponse>();
      api.batchUpdate.mockReturnValueOnce(slow.promise);
      owner.applyEntryCommand(101, FIRST_DATE, { kind: "score", score: 4 });
      await vi.advanceTimersByTimeAsync(750);
      expect(owner.getSnapshot().phase).toBe("saving");

      let settled = false;
      const drained = owner.drain().then((result) => {
        settled = true;
        return result;
      });
      await vi.advanceTimersByTimeAsync(10000);
      expect(settled).toBe(false);
      expect(owner.getSnapshot().draining).toBe(true);

      slow.resolve(appliedResponse(stateOf(101, FIRST_DATE, { attendance: true, score: 4 })));
      await expect(drained).resolves.toEqual({ kind: "acknowledged" });
      expect(owner.hasPending()).toBe(false);
      expect(owner.getSnapshot().draining).toBe(false);
    });

    it("flushes queued edits immediately instead of waiting for the debounce", async () => {
      api.batchUpdate.mockResolvedValue(appliedResponse(stateOf(101, FIRST_DATE, { attendance: true, score: 3 })));
      owner.applyEntryCommand(101, FIRST_DATE, { kind: "score", score: 3 });
      const result = await owner.drain();
      expect(result).toEqual({ kind: "acknowledged" });
      expect(api.batchUpdate).toHaveBeenCalledTimes(1);
    });

    it("keeps drafts and reports failed when the request fails", async () => {
      api.batchUpdate.mockRejectedValue(new AuthApiError(500, "boom"));
      owner.applyEntryCommand(101, FIRST_DATE, { kind: "score", score: 3 });
      const result = await owner.drain();
      expect(result).toEqual({ kind: "failed", unsettledCount: 1 });
      expect(owner.hasPending()).toBe(true);
      expect(cachedEntry(101)?.score).toBe(3);
      expect(owner.getSnapshot().phase).toBe("failed");
      expect(api.batchUpdate).toHaveBeenCalledTimes(1);
    });

    it("captures edits that arrive while draining and blocks premature success", async () => {
      const first = createDeferred<JournalBatchUpdateResponse>();
      api.batchUpdate
        .mockReturnValueOnce(first.promise)
        .mockResolvedValueOnce(appliedResponse(stateOf(101, FIRST_DATE, { attendance: true, score: 5, version: 3 })));
      owner.applyEntryCommand(101, FIRST_DATE, { kind: "score", score: 3 });
      await vi.advanceTimersByTimeAsync(750);

      let settled = false;
      const drained = owner.drain().then((result) => {
        settled = true;
        return result;
      });
      owner.applyEntryCommand(101, FIRST_DATE, { kind: "score", score: 5 });
      first.resolve(appliedResponse(stateOf(101, FIRST_DATE, { attendance: true, score: 3, version: 2 })));
      await vi.advanceTimersByTimeAsync(0);

      await expect(drained).resolves.toEqual({ kind: "acknowledged" });
      expect(settled).toBe(true);
      expect(api.batchUpdate).toHaveBeenCalledTimes(2);
      expect(api.batchUpdate.mock.calls[1][1]).toEqual([expect.objectContaining({ score: 5, version: 2 })]);
      expect(cachedEntry(101)?.score).toBe(5);
    });

    it("reports conflict instead of acknowledged when a conflict is unresolved", async () => {
      api.batchUpdate.mockResolvedValue({
        applied: [],
        conflicts: [
          { student_id: 101, lesson_date: FIRST_DATE, submitted_version: 1, current: stateOf(101, FIRST_DATE, { score: 2, attendance: true, version: 4 }) },
        ],
        summaries: [],
      });
      owner.applyEntryCommand(101, FIRST_DATE, { kind: "score", score: 5 });
      const result = await owner.drain();
      expect(result).toEqual({ kind: "conflict", conflictCount: 1 });
    });

    it("treats a summary-only in-flight request as pending work that drain waits for", async () => {
      const slow = createDeferred<ReturnType<typeof summaryResult>>();
      api.updateSummary.mockReturnValueOnce(slow.promise);
      owner.editSummaryField(101, "bonus_score", 4);
      await vi.advanceTimersByTimeAsync(750);

      expect(api.batchUpdate).not.toHaveBeenCalled();
      expect(owner.hasPending()).toBe(true);
      expect(owner.getSnapshot().phase).toBe("saving");

      let settled = false;
      const drained = owner.drain().then((result) => {
        settled = true;
        return result;
      });
      await vi.advanceTimersByTimeAsync(5000);
      expect(settled).toBe(false);

      slow.resolve(summaryResult(101, { bonus_score: 4, version: 2 }));
      await expect(drained).resolves.toEqual({ kind: "acknowledged" });
      expect(owner.hasPending()).toBe(false);
    });

    it("resolves unavailable after the owner is disposed", async () => {
      owner.dispose();
      await expect(owner.drain()).resolves.toEqual({ kind: "unavailable" });
    });
  });

  describe("confirmed, draft and in-flight separation", () => {
    it("lets an older acknowledgement update the version without erasing a newer local value", async () => {
      const first = createDeferred<JournalBatchUpdateResponse>();
      const second = createDeferred<JournalBatchUpdateResponse>();
      api.batchUpdate.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
      owner.applyEntryCommand(101, FIRST_DATE, { kind: "score", score: 3 });
      await vi.advanceTimersByTimeAsync(750);
      owner.applyEntryCommand(101, FIRST_DATE, { kind: "score", score: 5 });

      first.resolve(appliedResponse(stateOf(101, FIRST_DATE, { attendance: true, score: 3, version: 2 })));
      await vi.advanceTimersByTimeAsync(0);
      expect(cachedEntry(101)?.score).toBe(5);
      expect(cachedEntry(101)?.version).toBe(2);
      expect(api.batchUpdate.mock.calls[1][1]).toEqual([expect.objectContaining({ score: 5, version: 2 })]);
      second.resolve(appliedResponse(stateOf(101, FIRST_DATE, { attendance: true, score: 5, version: 3 })));
    });

    it("keeps a newer queued draft when the in-flight request fails", async () => {
      const slow = createDeferred<JournalBatchUpdateResponse>();
      api.batchUpdate.mockReturnValueOnce(slow.promise);
      owner.applyEntryCommand(101, FIRST_DATE, { kind: "score", score: 3 });
      await vi.advanceTimersByTimeAsync(750);
      owner.applyEntryCommand(101, FIRST_DATE, { kind: "score", score: 5 });

      slow.reject(new AuthApiError(400, "invalid"));
      await vi.advanceTimersByTimeAsync(0);

      expect(cachedEntry(101)?.score).toBe(5);
      expect(owner.getSnapshot().cellStatus.get(`101:${FIRST_DATE}`)).toBe("error");
      expect(owner.hasPending()).toBe(true);
    });

    it("never sends a draft from one journal to another journal", async () => {
      const secondDetail = buildDetail(2, 10);
      queryClient.setQueryData(["journals", "detail", 2], secondDetail);
      const secondOwner = new JournalQueueOwner(2, 10, queryClient, api);
      api.batchUpdate.mockResolvedValue(appliedResponse(stateOf(101, FIRST_DATE, { attendance: true, score: 4 })));

      owner.applyEntryCommand(101, FIRST_DATE, { kind: "score", score: 4 });
      await vi.advanceTimersByTimeAsync(750);

      expect(api.batchUpdate).toHaveBeenCalledTimes(1);
      expect(api.batchUpdate.mock.calls[0][0]).toBe(1);
      expect(secondOwner.hasPending()).toBe(false);
      expect(queryClient.getQueryData<JournalDetailResponse>(["journals", "detail", 2])?.students[0].entries[0].score).toBe(0);
      secondOwner.dispose();
    });

    it("applies entry and summary outcomes independently and retries only unsettled work", async () => {
      api.batchUpdate.mockResolvedValue(appliedResponse(stateOf(101, FIRST_DATE, { attendance: true, score: 4 })));
      api.updateSummary
        .mockRejectedValueOnce(new NetworkError())
        .mockResolvedValueOnce(summaryResult(102, { bonus_score: 3, version: 2 }));

      owner.applyEntryCommand(101, FIRST_DATE, { kind: "score", score: 4 });
      owner.editSummaryField(102, "bonus_score", 3);
      await vi.advanceTimersByTimeAsync(750);

      expect(api.batchUpdate).toHaveBeenCalledTimes(1);
      expect(api.updateSummary).toHaveBeenCalledTimes(1);
      expect(cachedEntry(101)?.score).toBe(4);
      expect(owner.getSnapshot().phase).toBe("unsaved");

      await vi.advanceTimersByTimeAsync(1100);
      expect(api.batchUpdate).toHaveBeenCalledTimes(1);
      expect(api.updateSummary).toHaveBeenCalledTimes(2);
      expect(owner.hasPending()).toBe(false);
    });

    it("does not resend or revert acknowledged entries when a summary is rejected", async () => {
      api.batchUpdate.mockResolvedValue(appliedResponse(stateOf(101, FIRST_DATE, { attendance: true, score: 4 })));
      api.updateSummary.mockRejectedValue(new AuthApiError(400, "bad"));

      owner.applyEntryCommand(101, FIRST_DATE, { kind: "score", score: 4 });
      owner.editSummaryField(102, "exam_score", 40);
      await vi.advanceTimersByTimeAsync(20000);

      expect(api.batchUpdate).toHaveBeenCalledTimes(1);
      expect(api.updateSummary).toHaveBeenCalledTimes(1);
      expect(cachedEntry(101)?.score).toBe(4);
      expect(owner.getSnapshot().phase).toBe("failed");
    });
  });

  describe("paired bonus and exam", () => {
    it("keeps both values when bonus and exam are edited before the debounce fires", async () => {
      api.updateSummary.mockResolvedValue(summaryResult(101, { bonus_score: 6, exam_score: 70, version: 2 }));
      owner.editSummaryField(101, "bonus_score", 6);
      owner.editSummaryField(101, "exam_score", 70);
      await vi.advanceTimersByTimeAsync(750);

      expect(api.updateSummary).toHaveBeenCalledTimes(1);
      expect(api.updateSummary).toHaveBeenCalledWith(1, 101, { bonus_score: 6, exam_score: 70, version: 1 });
      expect(cachedSummary(101)?.bonus_score).toBe(6);
      expect(cachedSummary(101)?.exam_score).toBe(70);
    });

    it("sends nothing when a summary field is set to the confirmed value", async () => {
      owner.editSummaryField(101, "bonus_score", 0);
      await vi.advanceTimersByTimeAsync(5000);
      expect(api.updateSummary).not.toHaveBeenCalled();
      expect(owner.hasPending()).toBe(false);
    });
  });

  describe("conflicts", () => {
    async function createEntryConflict(): Promise<void> {
      api.batchUpdate.mockResolvedValueOnce({
        applied: [],
        conflicts: [
          {
            student_id: 101,
            lesson_date: FIRST_DATE,
            submitted_version: 1,
            current: stateOf(101, FIRST_DATE, { attendance: true, score: 2, comment: "Server note", version: 4 }),
          },
        ],
        summaries: [],
      });
      owner.applyEntryCommand(101, FIRST_DATE, { kind: "comment", comment: "My note" });
      owner.applyEntryCommand(101, FIRST_DATE, { kind: "score", score: 5 });
      await vi.advanceTimersByTimeAsync(750);
    }

    it("preserves both sides of an entry conflict including comments", async () => {
      await createEntryConflict();
      const snapshot = owner.getSnapshot();
      expect(snapshot.phase).toBe("conflict");
      expect(snapshot.conflicts).toHaveLength(1);
      const conflict = snapshot.conflicts[0];
      expect(conflict.type).toBe("entry");
      expect(conflict.mine).toEqual({ attendance: true, score: 5, comment: "My note" });
      expect(conflict.current).toEqual(expect.objectContaining({ score: 2, comment: "Server note", version: 4 }));
    });

    it("Keep mine sends the latest local draft with the returned version", async () => {
      await createEntryConflict();
      owner.applyEntryCommand(101, FIRST_DATE, { kind: "score", score: 4 });
      await vi.advanceTimersByTimeAsync(5000);
      expect(api.batchUpdate).toHaveBeenCalledTimes(1);
      expect(owner.getSnapshot().conflicts[0].mine).toEqual({ attendance: true, score: 4, comment: "My note" });

      api.batchUpdate.mockResolvedValueOnce(appliedResponse(stateOf(101, FIRST_DATE, { attendance: true, score: 4, comment: "My note", version: 5 })));
      owner.resolveConflict(owner.getSnapshot().conflicts[0], "keepMine");
      await vi.advanceTimersByTimeAsync(750);

      expect(api.batchUpdate).toHaveBeenCalledTimes(2);
      expect(api.batchUpdate.mock.calls[1][1]).toEqual([
        expect.objectContaining({ score: 4, comment: "My note", version: 4 }),
      ]);
      expect(owner.getSnapshot().conflicts).toHaveLength(0);
    });

    it("Use server writes nothing and shows the server value", async () => {
      await createEntryConflict();
      owner.resolveConflict(owner.getSnapshot().conflicts[0], "keepTheirs");
      await vi.advanceTimersByTimeAsync(5000);

      expect(api.batchUpdate).toHaveBeenCalledTimes(1);
      expect(cachedEntry(101)).toEqual(expect.objectContaining({ score: 2, comment: "Server note", version: 4 }));
      expect(owner.hasPending()).toBe(false);
      expect(owner.getSnapshot().phase).toBe("idle");
    });

    it("recovers from a repeated conflict on the same cell", async () => {
      await createEntryConflict();
      api.batchUpdate.mockResolvedValueOnce({
        applied: [],
        conflicts: [
          {
            student_id: 101,
            lesson_date: FIRST_DATE,
            submitted_version: 4,
            current: stateOf(101, FIRST_DATE, { attendance: true, score: 1, comment: "Newer server", version: 7 }),
          },
        ],
        summaries: [],
      });
      owner.resolveConflict(owner.getSnapshot().conflicts[0], "keepMine");
      await vi.advanceTimersByTimeAsync(750);

      expect(owner.getSnapshot().conflicts).toHaveLength(1);
      expect(owner.getSnapshot().conflicts[0].current).toEqual(expect.objectContaining({ version: 7, comment: "Newer server" }));

      api.batchUpdate.mockResolvedValueOnce(appliedResponse(stateOf(101, FIRST_DATE, { attendance: true, score: 5, comment: "My note", version: 8 })));
      owner.resolveConflict(owner.getSnapshot().conflicts[0], "keepMine");
      await vi.advanceTimersByTimeAsync(750);

      expect(api.batchUpdate.mock.calls[2][1]).toEqual([expect.objectContaining({ score: 5, version: 7 })]);
      expect(owner.getSnapshot().conflicts).toHaveLength(0);
      expect(owner.hasPending()).toBe(false);
    });

    it("keeps Keep mine disabled for an unavailable entry and recovers through refetch", async () => {
      api.batchUpdate.mockResolvedValueOnce({
        applied: [],
        conflicts: [{ student_id: 101, lesson_date: FIRST_DATE, submitted_version: 1, current: null }],
        summaries: [],
      });
      owner.applyEntryCommand(101, FIRST_DATE, { kind: "score", score: 5 });
      await vi.advanceTimersByTimeAsync(750);

      const conflict = owner.getSnapshot().conflicts[0];
      expect(conflict.current).toBeNull();
      owner.resolveConflict(conflict, "keepMine");
      await vi.advanceTimersByTimeAsync(5000);
      expect(api.batchUpdate).toHaveBeenCalledTimes(1);
      expect(owner.getSnapshot().conflicts).toHaveLength(1);

      api.fetchJournal.mockResolvedValueOnce(
        serverDetail((detail) => {
          detail.students[0].entries[0] = { ...detail.students[0].entries[0], attendance: true, score: 1, version: 6 };
        }),
      );
      await owner.retryManual();
      expect(owner.getSnapshot().conflicts[0].current).toEqual(expect.objectContaining({ score: 1, version: 6 }));
      expect(owner.getSnapshot().refetching).toBe(false);
    });

    it("ignores a duplicate resolution of the same conflict", async () => {
      await createEntryConflict();
      const conflict = owner.getSnapshot().conflicts[0];
      api.batchUpdate.mockResolvedValue(appliedResponse(stateOf(101, FIRST_DATE, { attendance: true, score: 5, comment: "My note", version: 5 })));
      owner.resolveConflict(conflict, "keepMine");
      owner.resolveConflict(conflict, "keepMine");
      owner.resolveConflict(conflict, "keepTheirs");
      await vi.advanceTimersByTimeAsync(5000);

      expect(api.batchUpdate).toHaveBeenCalledTimes(2);
      expect(cachedEntry(101)?.score).toBe(5);
    });

    it("blocks resolution while a refetch is pending", async () => {
      await createEntryConflict();
      const slowRefetch = createDeferred<JournalDetailResponse>();
      api.fetchJournal.mockReturnValueOnce(slowRefetch.promise);
      const refetching = owner.retryManual();
      await vi.advanceTimersByTimeAsync(0);
      expect(owner.getSnapshot().refetching).toBe(true);

      owner.resolveConflict(owner.getSnapshot().conflicts[0], "keepTheirs");
      expect(owner.getSnapshot().conflicts).toHaveLength(1);

      slowRefetch.resolve(buildDetail());
      await refetching;
    });

    it("keeps unrelated rows editable and sendable while another cell is in conflict", async () => {
      await createEntryConflict();
      api.batchUpdate.mockResolvedValueOnce(appliedResponse(stateOf(102, FIRST_DATE, { attendance: true, score: 3 })));
      owner.applyEntryCommand(102, FIRST_DATE, { kind: "score", score: 3 });
      await vi.advanceTimersByTimeAsync(750);

      expect(api.batchUpdate.mock.calls[1][1]).toEqual([expect.objectContaining({ student_id: 102, score: 3 })]);
      expect(owner.getSnapshot().conflicts).toHaveLength(1);
      expect(owner.getSnapshot().cellStatus.get(`101:${FIRST_DATE}`)).toBe("conflict");
    });

    it("refetches automatically when a summary conflict has no snapshot and offers both sides", async () => {
      api.updateSummary.mockRejectedValueOnce(new AuthApiError(409, "summary version mismatch"));
      api.fetchJournal.mockResolvedValueOnce(
        serverDetail((detail) => {
          const summary = detail.students[0].summary!;
          detail.students[0].summary = { ...summary, bonus_score: 9, exam_score: 30, version: 3 };
        }),
      );
      owner.editSummaryField(101, "bonus_score", 5);
      await vi.advanceTimersByTimeAsync(750);

      expect(api.fetchJournal).toHaveBeenCalledTimes(1);
      const conflict = owner.getSnapshot().conflicts[0];
      expect(conflict.type).toBe("summary");
      expect(conflict.mine).toEqual({ bonus_score: 5, exam_score: 0 });
      expect(conflict.current).toEqual(expect.objectContaining({ bonus_score: 9, exam_score: 30, version: 3 }));
    });

    it("Use server on a summary conflict refreshes both fields and derived totals without a write", async () => {
      api.updateSummary.mockRejectedValueOnce(new AuthApiError(409, "summary version mismatch"));
      api.fetchJournal.mockResolvedValueOnce(
        serverDetail((detail) => {
          const summary = detail.students[0].summary!;
          detail.students[0].summary = { ...summary, bonus_score: 9, exam_score: 30, sum_score: 39, percentage: 39, version: 3 };
        }),
      );
      owner.editSummaryField(101, "bonus_score", 5);
      await vi.advanceTimersByTimeAsync(750);
      owner.resolveConflict(owner.getSnapshot().conflicts[0], "keepTheirs");
      await vi.advanceTimersByTimeAsync(5000);

      expect(api.updateSummary).toHaveBeenCalledTimes(1);
      expect(cachedSummary(101)).toEqual(expect.objectContaining({ bonus_score: 9, exam_score: 30, sum_score: 39, version: 3 }));
      expect(owner.hasPending()).toBe(false);
    });
  });

  describe("status priority", () => {
    it("never reports saved while a conflict or unsent draft remains", async () => {
      api.batchUpdate.mockResolvedValueOnce({
        applied: [stateOf(102, FIRST_DATE, { attendance: true, score: 3 })],
        conflicts: [{ student_id: 101, lesson_date: FIRST_DATE, submitted_version: 1, current: stateOf(101, FIRST_DATE, { score: 2, attendance: true, version: 4 }) }],
        summaries: [],
      });
      owner.applyEntryCommand(101, FIRST_DATE, { kind: "score", score: 5 });
      owner.applyEntryCommand(102, FIRST_DATE, { kind: "score", score: 3 });
      await vi.advanceTimersByTimeAsync(750);

      expect(owner.getSnapshot().phase).toBe("conflict");
      expect(owner.getSnapshot().aggregateStatus).toBe("error");
      await vi.advanceTimersByTimeAsync(10000);
      expect(owner.getSnapshot().phase).toBe("conflict");

      owner.applyEntryCommand(102, FIRST_DATE, { kind: "score", score: 1 });
      expect(owner.getSnapshot().phase).toBe("conflict");
    });

    it("moves through unsaved, saving, saved and idle for a clean save", async () => {
      const slow = createDeferred<JournalBatchUpdateResponse>();
      api.batchUpdate.mockReturnValueOnce(slow.promise);
      expect(owner.getSnapshot().phase).toBe("idle");
      owner.applyEntryCommand(101, FIRST_DATE, { kind: "score", score: 3 });
      expect(owner.getSnapshot().phase).toBe("unsaved");
      await vi.advanceTimersByTimeAsync(750);
      expect(owner.getSnapshot().phase).toBe("saving");
      slow.resolve(appliedResponse(stateOf(101, FIRST_DATE, { attendance: true, score: 3 })));
      await vi.advanceTimersByTimeAsync(0);
      expect(owner.getSnapshot().phase).toBe("saved");
      await vi.advanceTimersByTimeAsync(2500);
      expect(owner.getSnapshot().phase).toBe("idle");
    });

    it("prefers failed over saving while another request is still in flight", async () => {
      const slow = createDeferred<ReturnType<typeof summaryResult>>();
      api.updateSummary
        .mockRejectedValueOnce(new AuthApiError(400, "bad"))
        .mockReturnValueOnce(slow.promise);
      owner.editSummaryField(101, "bonus_score", 2);
      owner.editSummaryField(102, "bonus_score", 3);
      await vi.advanceTimersByTimeAsync(750);

      const snapshot = owner.getSnapshot();
      expect(snapshot.counts.failed).toBe(1);
      expect(snapshot.counts.saving).toBe(1);
      expect(snapshot.phase).toBe("failed");
      slow.resolve(summaryResult(102, { bonus_score: 3, version: 2 }));
    });

    it("prefers conflict over failed", async () => {
      api.batchUpdate.mockResolvedValueOnce({
        applied: [],
        conflicts: [{ student_id: 101, lesson_date: FIRST_DATE, submitted_version: 1, current: stateOf(101, FIRST_DATE, { score: 2, attendance: true, version: 4 }) }],
        summaries: [],
      });
      api.updateSummary.mockRejectedValueOnce(new AuthApiError(400, "bad"));
      owner.applyEntryCommand(101, FIRST_DATE, { kind: "score", score: 5 });
      owner.editSummaryField(102, "bonus_score", 3);
      await vi.advanceTimersByTimeAsync(750);

      const snapshot = owner.getSnapshot();
      expect(snapshot.counts.conflicts).toBe(1);
      expect(snapshot.counts.failed).toBe(1);
      expect(snapshot.phase).toBe("conflict");
    });
  });

  describe("authoritative refresh and discard", () => {
    it("lets a background refresh sync pristine cells but keeps local drafts", async () => {
      api.batchUpdate.mockRejectedValue(new AuthApiError(400, "bad"));
      owner.applyEntryCommand(101, FIRST_DATE, { kind: "score", score: 4 });
      await vi.advanceTimersByTimeAsync(750);

      queryClient.setQueryData(
        ["journals", "detail", 1],
        serverDetail((detail) => {
          detail.students[0].entries[0] = { ...detail.students[0].entries[0], score: 1, attendance: true, version: 3 };
          detail.students[0].entries[1] = { ...detail.students[0].entries[1], score: 5, attendance: true, version: 3 };
        }),
      );
      await vi.advanceTimersByTimeAsync(10);

      expect(cachedEntry(101, FIRST_DATE)?.score).toBe(4);
      expect(cachedEntry(101, SECOND_DATE)?.score).toBe(5);
    });

    it("discards only unsettled work without any write and restores confirmed values", async () => {
      api.batchUpdate.mockRejectedValue(new AuthApiError(400, "bad"));
      owner.applyEntryCommand(101, FIRST_DATE, { kind: "score", score: 4 });
      owner.editSummaryField(102, "bonus_score", 3);
      await vi.advanceTimersByTimeAsync(750);
      api.batchUpdate.mockClear();

      await expect(owner.discardUnsettled()).resolves.toEqual({ kind: "discarded" });
      expect(api.batchUpdate).not.toHaveBeenCalled();
      expect(cachedEntry(101)?.score).toBe(0);
      expect(cachedSummary(102)?.bonus_score).toBe(0);
      expect(owner.hasPending()).toBe(false);
      expect(owner.getSnapshot().phase).toBe("idle");
    });

    it("refetches before discarding when an in-flight outcome is uncertain", async () => {
      api.batchUpdate.mockRejectedValue(new NetworkError());
      owner.applyEntryCommand(101, FIRST_DATE, { kind: "score", score: 4 });
      const drained = await owner.drain();
      expect(drained.kind).toBe("failed");

      api.fetchJournal.mockResolvedValueOnce(
        serverDetail((detail) => {
          detail.students[0].entries[0] = { ...detail.students[0].entries[0], score: 4, attendance: true, version: 2 };
        }),
      );
      await expect(owner.discardUnsettled()).resolves.toEqual({ kind: "discarded" });
      expect(api.fetchJournal).toHaveBeenCalledTimes(1);
      expect(cachedEntry(101)?.score).toBe(4);
      expect(cachedEntry(101)?.version).toBe(2);
    });

    it("keeps drafts when the authoritative refetch fails during discard", async () => {
      api.batchUpdate.mockRejectedValue(new NetworkError());
      owner.applyEntryCommand(101, FIRST_DATE, { kind: "score", score: 4 });
      await owner.drain();
      api.fetchJournal.mockRejectedValueOnce(new NetworkError());

      await expect(owner.discardUnsettled()).resolves.toEqual({ kind: "unavailable" });
      expect(owner.hasPending()).toBe(true);
      expect(cachedEntry(101)?.score).toBe(4);
    });
  });
});

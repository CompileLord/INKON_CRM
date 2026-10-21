import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QueryClient } from "@tanstack/react-query";
import { AuthApiError } from "../auth/errors";
import { JournalQueueOwner, MAX_ENTRIES_PER_REQUEST } from "./JournalQueueOwner";
import {
  FIRST_DATE,
  buildDetail,
  createDeferred,
  createFakeApi,
  createQueryClientWith,
  stateOf,
  type FakeJournalApi,
} from "./journalQueueTestSupport";
import type { JournalBatchUpdateResponse, JournalEntryUpdate } from "./types";

const FIRST_STUDENT_ID: number = 1000;

function echoApplied(payload: JournalEntryUpdate[]): JournalBatchUpdateResponse {
  return {
    applied: payload.map((item: JournalEntryUpdate) =>
      stateOf(item.student_id, item.lesson_date, {
        attendance: item.attendance,
        score: item.score,
        comment: item.comment ?? null,
        version: item.version + 1,
      }),
    ),
    conflicts: [],
    summaries: [],
  };
}

function keysOf(payload: JournalEntryUpdate[]): string[] {
  return payload.map((item: JournalEntryUpdate) => `${item.student_id}|${item.lesson_date}`);
}

describe("JournalQueueOwner bounded batches", () => {
  let api: FakeJournalApi;
  let queryClient: QueryClient;
  let owner: JournalQueueOwner;

  function stageCells(count: number, score: number = 3): void {
    for (let offset: number = 0; offset < count; offset += 1) {
      owner.applyEntryCommand(FIRST_STUDENT_ID + offset, FIRST_DATE, { kind: "score", score });
    }
  }

  function sentPayloads(): JournalEntryUpdate[][] {
    return api.batchUpdate.mock.calls.map((call) => call[1] as JournalEntryUpdate[]);
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

  it("caps requests at 250 unique cells", () => {
    expect(MAX_ENTRIES_PER_REQUEST).toBe(250);
  });

  it("splits 251 distinct cells into 250 plus 1 and saves every cell", async () => {
    api.batchUpdate.mockImplementation(async (_id, payload) => echoApplied(payload));
    stageCells(251);
    await vi.advanceTimersByTimeAsync(750);
    const payloads: JournalEntryUpdate[][] = sentPayloads();
    expect(payloads.map((payload) => payload.length)).toEqual([250, 1]);
    const sent: Set<string> = new Set(payloads.flatMap(keysOf));
    expect(sent.size).toBe(251);
    expect(owner.hasPending()).toBe(false);
  });

  it("splits 501 distinct cells into 250, 250 and 1 without duplicates", async () => {
    api.batchUpdate.mockImplementation(async (_id, payload) => echoApplied(payload));
    stageCells(501);
    await vi.advanceTimersByTimeAsync(750);
    const payloads: JournalEntryUpdate[][] = sentPayloads();
    expect(payloads.map((payload) => payload.length)).toEqual([250, 250, 1]);
    const all: string[] = payloads.flatMap(keysOf);
    expect(new Set(all).size).toBe(501);
    expect(all.length).toBe(501);
    expect(owner.hasPending()).toBe(false);
  });

  it("coalesces repeated edits of one cell into a single transported item", async () => {
    api.batchUpdate.mockImplementation(async (_id, payload) => echoApplied(payload));
    owner.applyEntryCommand(FIRST_STUDENT_ID, FIRST_DATE, { kind: "score", score: 1 });
    owner.applyEntryCommand(FIRST_STUDENT_ID, FIRST_DATE, { kind: "score", score: 2 });
    owner.applyEntryCommand(FIRST_STUDENT_ID, FIRST_DATE, { kind: "score", score: 5 });
    await vi.advanceTimersByTimeAsync(750);
    const payloads: JournalEntryUpdate[][] = sentPayloads();
    expect(payloads).toHaveLength(1);
    expect(payloads[0]).toHaveLength(1);
    expect(payloads[0][0].score).toBe(5);
  });

  it("keeps a partially conflicted cell and the undrained cells as drafts", async () => {
    api.batchUpdate.mockImplementationOnce(async (_id, payload) => {
      const [conflicted, ...rest] = payload;
      return {
        applied: echoApplied(rest).applied,
        conflicts: [
          {
            student_id: conflicted.student_id,
            lesson_date: conflicted.lesson_date,
            submitted_version: conflicted.version,
            current: stateOf(conflicted.student_id, conflicted.lesson_date, { score: 9, version: 7 }),
          },
        ],
        summaries: [],
      };
    });
    stageCells(251);
    await vi.advanceTimersByTimeAsync(750);
    expect(api.batchUpdate).toHaveBeenCalledTimes(1);
    expect(owner.getSnapshot().conflicts).toHaveLength(1);
    expect(owner.hasPending()).toBe(true);

    api.batchUpdate.mockImplementation(async (_id, payload) => echoApplied(payload));
    await owner.drain();
    const lastPayload: JournalEntryUpdate[] = sentPayloads()[1];
    expect(lastPayload.map((item) => item.student_id)).toEqual([FIRST_STUDENT_ID + 250]);
    expect(owner.getSnapshot().conflicts).toHaveLength(1);
  });

  it("keeps a newer edit made during a bounded request and sends it with the acknowledged version", async () => {
    const first = createDeferred<JournalBatchUpdateResponse>();
    api.batchUpdate
      .mockReturnValueOnce(first.promise)
      .mockImplementation(async (_id, payload) => echoApplied(payload));
    stageCells(251);
    await vi.advanceTimersByTimeAsync(750);
    owner.applyEntryCommand(FIRST_STUDENT_ID, FIRST_DATE, { kind: "score", score: 5 });
    first.resolve(echoApplied(sentPayloads()[0]));
    await vi.advanceTimersByTimeAsync(750);
    const second: JournalEntryUpdate[] = sentPayloads()[1];
    const resent: JournalEntryUpdate | undefined = second.find((item) => item.student_id === FIRST_STUDENT_ID);
    expect(resent).toMatchObject({ score: 5, version: 1 });
    expect(second.some((item) => item.student_id === FIRST_STUDENT_ID + 250)).toBe(true);
    expect(owner.hasPending()).toBe(false);
  });

  it("loses no cell when the second bounded request fails and a retry succeeds", async () => {
    api.batchUpdate
      .mockImplementationOnce(async (_id, payload) => echoApplied(payload))
      .mockRejectedValueOnce(new AuthApiError(500, "boom"))
      .mockImplementation(async (_id, payload) => echoApplied(payload));
    stageCells(300);
    const result = await owner.drain();
    expect(result).toEqual({ kind: "failed", unsettledCount: 50 });
    expect(owner.hasPending()).toBe(true);
    await owner.flush();
    const delivered: Set<string> = new Set(
      sentPayloads()
        .flatMap(keysOf)
        .filter((key) => key.length > 0),
    );
    expect(delivered.size).toBe(300);
    expect(owner.hasPending()).toBe(false);
  });

  it("fits the largest escaped-comment batch within the 4,194,304 byte body cap", () => {
    const worstCaseComment: string = "\u0001".repeat(1000);
    const payload: JournalEntryUpdate[] = Array.from({ length: MAX_ENTRIES_PER_REQUEST }, (_unused, offset: number) => ({
      student_id: 999999999 + offset,
      lesson_date: FIRST_DATE,
      attendance: true,
      score: 5,
      comment: worstCaseComment,
      version: 2147483647,
    }));
    const bytes: number = new TextEncoder().encode(JSON.stringify(payload)).length;
    expect(bytes).toBeLessThan(4194304);
  });
});

import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode, ReactElement } from "react";
import MockAdapter from "axios-mock-adapter";
import { httpClient } from "../auth/httpClient";
import { useMyStudentJournalHistory } from "./hooks";
import type { StudentJournalPeriod } from "./types";

const mock: MockAdapter = new MockAdapter(httpClient);
const clients: QueryClient[] = [];
afterEach((): void => { cleanup(); clients.forEach((client: QueryClient): void => client.clear()); mock.reset(); });
class HistoryFixture {
  static period(id: number): StudentJournalPeriod {
    return { journal_id: id, course_id: 4, course_title: "Math", period_label: `Week ${id}`, period_start: "2026-01-01", period_end: "2026-01-07", sum_score: 0, max_period_score: 100, percentage: 0, attendance_count: 0, total_lessons: 1, state: "graded" };
  }
  static wrapper({ children }: { children: ReactNode }): ReactElement {
    return <QueryClientProvider client={clients[clients.length - 1]}>{children}</QueryClientProvider>;
  }
  static client(): void { clients.push(new QueryClient({ defaultOptions: { queries: { retry: false } } })); }
}

describe("bounded student history", (): void => {
  it("fetches one bounded page regardless of lifetime size, then follows tied-date cursors only on request", async (): Promise<void> => {
    HistoryFixture.client();
    mock.onGet("/students/me/journals/page").reply((config) => [200, config.params.cursor ? { items: [HistoryFixture.period(1)], next_cursor: null, has_upcoming_periods: true } : { items: [HistoryFixture.period(3), HistoryFixture.period(2)], next_cursor: "signed-boundary", has_upcoming_periods: true }]);
    const hook: { result: { current: ReturnType<typeof useMyStudentJournalHistory> }; rerender: (props: { courseId: number }) => void } = renderHook(() => useMyStudentJournalHistory(4), { wrapper: HistoryFixture.wrapper });
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
    expect(mock.history.get).toHaveLength(1);
    expect(mock.history.get[0].params).toEqual({ course_id: 4, page_size: 20, started_only: true, cursor: undefined });
    expect(hook.result.current.hasNextPage).toBe(true);
    await act(async (): Promise<void> => { await hook.result.current.fetchNextPage(); });
    expect(mock.history.get[1].params.cursor).toBe("signed-boundary");
    await waitFor(() => expect(hook.result.current.data?.pages).toHaveLength(2));
    expect(hook.result.current.data?.pages.flatMap((page) => page.items.map((period) => period.journal_id))).toEqual([3, 2, 1]);
    expect(hook.result.current.hasNextPage).toBe(false);
  });

  it("resets the cursor when a course filter changes", async (): Promise<void> => {
    HistoryFixture.client();
    mock.onGet("/students/me/journals/page").reply(200, { items: [], next_cursor: "next", has_upcoming_periods: false });
    const hook: { result: { current: ReturnType<typeof useMyStudentJournalHistory> }; rerender: (props: { courseId: number }) => void } = renderHook(({ courseId }: { courseId: number }) => useMyStudentJournalHistory(courseId), { initialProps: { courseId: 4 }, wrapper: HistoryFixture.wrapper });
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
    await act(async (): Promise<void> => { await hook.result.current.fetchNextPage(); });
    hook.rerender({ courseId: 5 });
    await waitFor(() => expect(mock.history.get).toHaveLength(3));
    expect(mock.history.get[2].params).toEqual({ course_id: 5, page_size: 20, started_only: true, cursor: undefined });
  });

  it.each([403, 422])("surfaces %s without retrying or draining, and supports corrected retry", async (status: number): Promise<void> => {
    HistoryFixture.client();
    mock.onGet("/students/me/journals/page").replyOnce(status, { detail: "Denied" }).onGet("/students/me/journals/page").reply(200, { items: [], next_cursor: null, has_upcoming_periods: false });
    const hook: { result: { current: ReturnType<typeof useMyStudentJournalHistory> }; rerender: (props: { courseId: number }) => void } = renderHook(() => useMyStudentJournalHistory(4), { wrapper: HistoryFixture.wrapper });
    await waitFor(() => expect(hook.result.current.isError).toBe(true));
    expect(mock.history.get).toHaveLength(1);
    await act(async (): Promise<void> => { await hook.result.current.refetch(); });
    await waitFor(() => expect(hook.result.current.data?.pages[0].items).toEqual([]));
  });
});

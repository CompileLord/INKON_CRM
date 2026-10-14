import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEffect } from "react";
import { cleanup, render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import { Link, RouterProvider, createMemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "../../i18n";
import { JournalQueueProvider } from "../../lib/journals/JournalQueueProvider";
import { useJournalQueueRegistry } from "../../lib/journals/journalQueueContext";
import { useJournalAutosave } from "../../lib/journals/useJournalAutosave";
import { useJournalNavigationGuard } from "../../lib/journals/useJournalNavigationGuard";
import { useJournalQueueStatus } from "../../lib/journals/useJournalQueueStatus";
import { JournalDrainDialog } from "./JournalDrainDialog";
import { AuthApiError } from "../../lib/auth/errors";
import * as endpoints from "../../lib/journals/endpoints";
import {
  FIRST_DATE,
  appliedResponse,
  buildDetail,
  createDeferred,
  createQueryClientWith,
  stateOf,
} from "../../lib/journals/journalQueueTestSupport";
import type { JournalBatchUpdateResponse, JournalDetailResponse } from "../../lib/journals/types";
import type { JournalQueueRegistry } from "../../lib/journals/JournalQueueRegistry";

vi.hoisted(() =>
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
  }),
);

vi.mock("../../lib/journals/endpoints", () => ({
  batchUpdateJournalEntries: vi.fn(),
  updateJournalStudentSummary: vi.fn(),
  getJournal: vi.fn(),
}));

const registryHolder: { current: JournalQueueRegistry | null } = { current: null };
const onReview = vi.fn();

function JournalPage() {
  const pageRegistry = useJournalQueueRegistry();
  useEffect(() => {
    registryHolder.current = pageRegistry;
  }, [pageRegistry]);
  const autosave = useJournalAutosave(1, 10);
  const guard = useJournalNavigationGuard();
  const status = useJournalQueueStatus();
  return (
    <div data-draining={status.draining ? "yes" : "no"}>
      <button type="button" onClick={() => autosave.applyEntryCommand(101, FIRST_DATE, { kind: "score", score: 4 })}>
        grade
      </button>
      <button type="button" onClick={() => autosave.applyEntryCommand(101, FIRST_DATE, { kind: "score", score: 5 })}>
        grade again
      </button>
      <Link to="/other">leave</Link>
      <JournalDrainDialog guard={guard} onReview={onReview} />
    </div>
  );
}

describe("journal navigation drain boundary", () => {
  let queryClient: QueryClient;
  let router: ReturnType<typeof createMemoryRouter>;

  function mountRouter(entries: string[], index: number) {
    router = createMemoryRouter(
      [
        {
          path: "/journal",
          element: (
            <JournalQueueProvider>
              <JournalPage />
            </JournalQueueProvider>
          ),
        },
        { path: "/other", element: <div>other page</div> },
      ],
      { initialEntries: entries, initialIndex: index },
    );
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
  }

  function cachedScore(): number | undefined {
    return queryClient
      .getQueryData<JournalDetailResponse>(["journals", "detail", 1])
      ?.students[0].entries.find((entry) => entry.lesson_date === FIRST_DATE)?.score;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(endpoints.batchUpdateJournalEntries).mockReset();
    queryClient = createQueryClientWith(buildDetail());
  });

  afterEach(() => cleanup());

  it("waits for a slow request, freezes context while draining, then navigates", async () => {
    const slow = createDeferred<JournalBatchUpdateResponse>();
    vi.mocked(endpoints.batchUpdateJournalEntries).mockReturnValueOnce(slow.promise);
    mountRouter(["/journal"], 0);

    fireEvent.click(screen.getByText("grade"));
    fireEvent.click(screen.getByText("leave"));

    await screen.findByText("Saving your changes before you leave…");
    expect(router.state.location.pathname).toBe("/journal");
    expect(document.querySelector("[data-draining]")?.getAttribute("data-draining")).toBe("yes");

    await act(async () => {
      slow.resolve(appliedResponse(stateOf(101, FIRST_DATE, { attendance: true, score: 4 })));
    });

    await waitFor(() => expect(router.state.location.pathname).toBe("/other"));
    expect(endpoints.batchUpdateJournalEntries).toHaveBeenCalledTimes(1);
  });

  it("captures an edit made during the drain and navigates only after both requests settle", async () => {
    const first = createDeferred<JournalBatchUpdateResponse>();
    const second = createDeferred<JournalBatchUpdateResponse>();
    vi.mocked(endpoints.batchUpdateJournalEntries).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    mountRouter(["/journal"], 0);

    fireEvent.click(screen.getByText("grade"));
    fireEvent.click(screen.getByText("leave"));
    await screen.findByText("Saving your changes before you leave…");
    fireEvent.click(screen.getByText("grade again"));

    await act(async () => {
      first.resolve(appliedResponse(stateOf(101, FIRST_DATE, { attendance: true, score: 4 })));
    });
    expect(router.state.location.pathname).toBe("/journal");
    expect(endpoints.batchUpdateJournalEntries).toHaveBeenCalledTimes(2);

    await act(async () => {
      second.resolve(appliedResponse(stateOf(101, FIRST_DATE, { attendance: true, score: 5, version: 3 })));
    });
    await waitFor(() => expect(router.state.location.pathname).toBe("/other"));
  });

  it("stays in context with Retry, Stay and Discard when the drain fails, and keeps the drafts", async () => {
    vi.mocked(endpoints.batchUpdateJournalEntries).mockRejectedValueOnce(new AuthApiError(500, "server down"));
    mountRouter(["/journal"], 0);

    fireEvent.click(screen.getByText("grade"));
    fireEvent.click(screen.getByText("leave"));

    await screen.findByText("Changes could not be saved");
    expect(router.state.location.pathname).toBe("/journal");
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Stay" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Discard unsaved changes" })).toBeTruthy();
    expect(registryHolder.current?.hasPending()).toBe(true);
    expect(cachedScore()).toBe(4);

    fireEvent.click(screen.getByRole("button", { name: "Stay" }));
    await waitFor(() => expect(screen.queryByText("Changes could not be saved")).toBeNull());
    expect(router.state.location.pathname).toBe("/journal");
    expect(registryHolder.current?.hasPending()).toBe(true);
  });

  it("Retry saves the kept drafts and then completes the navigation", async () => {
    vi.mocked(endpoints.batchUpdateJournalEntries)
      .mockRejectedValueOnce(new AuthApiError(500, "server down"))
      .mockResolvedValueOnce(appliedResponse(stateOf(101, FIRST_DATE, { attendance: true, score: 4 })));
    mountRouter(["/journal"], 0);

    fireEvent.click(screen.getByText("grade"));
    fireEvent.click(screen.getByText("leave"));
    await screen.findByText("Changes could not be saved");

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/other"));
    expect(endpoints.batchUpdateJournalEntries).toHaveBeenCalledTimes(2);
  });

  it("Discard leaves without another write and without keeping the unsaved value", async () => {
    vi.mocked(endpoints.batchUpdateJournalEntries).mockRejectedValue(new AuthApiError(400, "invalid"));
    mountRouter(["/journal"], 0);

    fireEvent.click(screen.getByText("grade"));
    fireEvent.click(screen.getByText("leave"));
    await screen.findByText("Changes could not be saved");
    vi.mocked(endpoints.batchUpdateJournalEntries).mockClear();

    fireEvent.click(screen.getByRole("button", { name: "Discard unsaved changes" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/other"));
    expect(endpoints.batchUpdateJournalEntries).not.toHaveBeenCalled();
    expect(cachedScore()).toBe(0);
    expect(registryHolder.current?.hasPending()).toBe(false);
  });

  it("routes browser Back through the same drain", async () => {
    const slow = createDeferred<JournalBatchUpdateResponse>();
    vi.mocked(endpoints.batchUpdateJournalEntries).mockReturnValueOnce(slow.promise);
    mountRouter(["/other", "/journal"], 1);

    fireEvent.click(screen.getByText("grade"));
    await act(async () => {
      void router.navigate(-1);
    });

    await screen.findByText("Saving your changes before you leave…");
    expect(router.state.location.pathname).toBe("/journal");

    await act(async () => {
      slow.resolve(appliedResponse(stateOf(101, FIRST_DATE, { attendance: true, score: 4 })));
    });
    await waitFor(() => expect(router.state.location.pathname).toBe("/other"));
  });

  it("does not block navigation when nothing is unsettled", async () => {
    mountRouter(["/journal"], 0);
    fireEvent.click(screen.getByText("leave"));
    await waitFor(() => expect(router.state.location.pathname).toBe("/other"));
    expect(endpoints.batchUpdateJournalEntries).not.toHaveBeenCalled();
  });

  it("offers Review for an unresolved conflict and does not navigate", async () => {
    vi.mocked(endpoints.batchUpdateJournalEntries).mockResolvedValueOnce({
      applied: [],
      conflicts: [
        { student_id: 101, lesson_date: FIRST_DATE, submitted_version: 1, current: stateOf(101, FIRST_DATE, { attendance: true, score: 1, version: 5 }) },
      ],
      summaries: [],
    });
    mountRouter(["/journal"], 0);

    fireEvent.click(screen.getByText("grade"));
    fireEvent.click(screen.getByText("leave"));

    await screen.findByText("Some changes conflict with newer data on the server. Review them before leaving.");
    expect(router.state.location.pathname).toBe("/journal");
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    expect(onReview).toHaveBeenCalledTimes(1);
    expect(router.state.location.pathname).toBe("/journal");
  });
});

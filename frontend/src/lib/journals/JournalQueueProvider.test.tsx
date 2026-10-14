import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { JournalQueueProvider } from "./JournalQueueProvider";
import { useJournalQueueRegistry } from "./journalQueueContext";
import { useJournalAutosave } from "./useJournalAutosave";
import type { JournalQueueRegistry } from "./JournalQueueRegistry";
import * as endpoints from "./endpoints";
import { FIRST_DATE, appliedResponse, buildDetail, createQueryClientWith, stateOf } from "./journalQueueTestSupport";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("./endpoints", () => ({
  batchUpdateJournalEntries: vi.fn(),
  updateJournalStudentSummary: vi.fn(),
  getJournal: vi.fn(),
}));

type AutosaveHandle = ReturnType<typeof useJournalAutosave>;

describe("JournalQueueProvider", () => {
  let container: HTMLDivElement;
  let root: Root;
  let queryClient: QueryClient;
  let registry: JournalQueueRegistry;
  let gridHandle: AutosaveHandle;
  let lessonHandle: AutosaveHandle;
  let secondGridHandle: AutosaveHandle;

  function GridView() {
    gridHandle = useJournalAutosave(1, 10);
    return <div data-testid="grid-view" />;
  }

  function SecondGridView() {
    secondGridHandle = useJournalAutosave(1, 10);
    return <div data-testid="second-grid-view" />;
  }

  function LessonView() {
    lessonHandle = useJournalAutosave(1, 10);
    return <div data-testid="lesson-view" />;
  }

  function RegistryProbe({ children }: { children: ReactNode }) {
    registry = useJournalQueueRegistry();
    return <>{children}</>;
  }

  function mount(view: ReactNode) {
    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <JournalQueueProvider>
            <RegistryProbe>{view}</RegistryProbe>
          </JournalQueueProvider>
        </QueryClientProvider>,
      );
    });
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    queryClient = createQueryClientWith(buildDetail());
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  it("keeps one owner and one request when the view changes during the debounce window", async () => {
    vi.mocked(endpoints.batchUpdateJournalEntries).mockResolvedValue(
      appliedResponse(stateOf(101, FIRST_DATE, { attendance: true, score: 4 })),
    );
    mount(<GridView />);
    const ownerBeforeSwitch = registry.ownerFor(1);

    act(() => {
      gridHandle.applyEntryCommand(101, FIRST_DATE, { kind: "score", score: 4 });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    mount(<LessonView />);
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(registry.ownerFor(1)).toBe(ownerBeforeSwitch);
    expect(lessonHandle.cellStatus.get(`101:${FIRST_DATE}`)).toBe("dirty");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(endpoints.batchUpdateJournalEntries).toHaveBeenCalledTimes(1);
    expect(endpoints.batchUpdateJournalEntries).toHaveBeenCalledWith(1, [expect.objectContaining({ score: 4 })]);
  });

  it("shares one owner between two consumers so there is never a second autosave for the same journal", async () => {
    vi.mocked(endpoints.batchUpdateJournalEntries).mockResolvedValue(
      appliedResponse(stateOf(101, FIRST_DATE, { attendance: true, score: 3 })),
    );
    mount(
      <>
        <GridView />
        <SecondGridView />
      </>,
    );

    act(() => {
      gridHandle.applyEntryCommand(101, FIRST_DATE, { kind: "score", score: 3 });
    });
    expect(secondGridHandle.cellStatus.get(`101:${FIRST_DATE}`)).toBe("dirty");
    act(() => {
      secondGridHandle.applyEntryCommand(101, FIRST_DATE, { kind: "comment", comment: "Both views" });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(750);
    });

    expect(endpoints.batchUpdateJournalEntries).toHaveBeenCalledTimes(1);
    expect(endpoints.batchUpdateJournalEntries).toHaveBeenCalledWith(1, [
      expect.objectContaining({ score: 3, comment: "Both views" }),
    ]);
  });

  it("keeps the owner and its drafts when every view unmounts", async () => {
    mount(<GridView />);
    act(() => {
      gridHandle.applyEntryCommand(101, FIRST_DATE, { kind: "score", score: 2 });
    });
    mount(<div />);
    expect(registry.hasPending()).toBe(true);
    mount(<LessonView />);
    expect(lessonHandle.cellStatus.get(`101:${FIRST_DATE}`)).toBe("dirty");
  });

  it("warns on unload only while work is unsettled", () => {
    mount(<GridView />);
    const cleanEvent = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(cleanEvent);
    expect(cleanEvent.defaultPrevented).toBe(false);

    act(() => {
      gridHandle.applyEntryCommand(101, FIRST_DATE, { kind: "score", score: 2 });
    });
    const dirtyEvent = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(dirtyEvent);
    expect(dirtyEvent.defaultPrevented).toBe(true);
  });

  it("aggregates the highest priority phase across journals", () => {
    queryClient.setQueryData(["journals", "detail", 2], buildDetail(2, 10));
    mount(<GridView />);
    registry.ownerFor(2, 10).applyEntryCommand(101, FIRST_DATE, { kind: "score", score: 1 });
    expect(registry.getSnapshot().phase).toBe("unsaved");
    expect(registry.getSnapshot().counts.unsaved).toBe(1);
    expect(registry.getSnapshot().hasPending).toBe(true);
  });
});

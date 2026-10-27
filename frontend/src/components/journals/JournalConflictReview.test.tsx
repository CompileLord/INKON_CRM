import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import "../../i18n";
import { JournalConflictReview } from "./JournalConflictReview";
import { FIRST_DATE, buildDetail, createQueryClientWith, stateOf, summaryResult } from "../../lib/journals/journalQueueTestSupport";
import type { JournalRegistryConflict } from "../../lib/journals/JournalQueueRegistry";

vi.hoisted(() =>
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
  }),
);

afterEach(() => cleanup());

const entryConflict: JournalRegistryConflict = {
  journalId: 1,
  conflict: {
    type: "entry",
    student_id: 101,
    lesson_date: FIRST_DATE,
    submitted_version: 1,
    mine: { attendance: true, score: 5, comment: "My note about homework" },
    current: stateOf(101, FIRST_DATE, { attendance: false, score: 0, comment: "Server note about absence", version: 4 }),
  },
};

function renderReview(conflicts: JournalRegistryConflict[], refetching = false) {
  const handlers = { onClose: vi.fn(), onResolve: vi.fn(), onRefetch: vi.fn() };
  render(
    <QueryClientProvider client={createQueryClientWith(buildDetail())}>
      <JournalConflictReview open conflicts={conflicts} refetching={refetching} {...handlers} />
    </QueryClientProvider>,
  );
  return handlers;
}

describe("JournalConflictReview", () => {
  it("labels both sides and shows the student, lesson and both comments", () => {
    renderReview([entryConflict]);
    const item = screen.getByTestId("conflict-review-item");
    expect(within(item).getByText("Student One")).toBeTruthy();
    expect(within(item).getByText("Week 1")).toBeTruthy();
    expect(item.textContent).toContain("Lesson");
    const mine = within(item).getByTestId("conflict-your-value");
    const server = within(item).getByTestId("conflict-server-value");
    expect(mine.textContent).toContain("Your value");
    expect(mine.textContent).toContain("My note about homework");
    expect(mine.textContent).toContain("Score: 5");
    expect(server.textContent).toContain("Server value");
    expect(server.textContent).toContain("Server note about absence");
    expect(server.textContent).toContain("Absent");
  });

  it("shows the summary pair context with bonus and exam on both sides", () => {
    renderReview([
      {
        journalId: 1,
        conflict: {
          type: "summary",
          student_id: 102,
          submitted_version: 1,
          mine: { bonus_score: 5, exam_score: 60 },
          current: summaryResult(102, { bonus_score: 9, exam_score: 30, version: 3 }),
        },
      },
    ]);
    const item = screen.getByTestId("conflict-review-item");
    expect(item.textContent).toContain("Bonus and exam scores");
    expect(within(screen.getByTestId("conflict-your-value")).getByText("Bonus: 5")).toBeTruthy();
    expect(within(screen.getByTestId("conflict-server-value")).getByText("Exam: 30")).toBeTruthy();
  });

  it("resolves with the chosen side", () => {
    const { onResolve } = renderReview([entryConflict]);
    fireEvent.click(screen.getByRole("button", { name: "Keep mine" }));
    expect(onResolve).toHaveBeenCalledWith(1, entryConflict.conflict, "keepMine");
    fireEvent.click(screen.getByRole("button", { name: "Use server value" }));
    expect(onResolve).toHaveBeenCalledWith(1, entryConflict.conflict, "keepTheirs");
  });

  it("shows Entry unavailable with Refetch and disables Keep mine when the server row is gone", () => {
    const { onRefetch, onResolve } = renderReview([{ journalId: 1, conflict: { ...entryConflict.conflict, current: null } }]);
    expect(screen.getAllByText("Entry unavailable").length).toBeGreaterThan(0);
    const keepMine = screen.getByRole("button", { name: "Keep mine" }) as HTMLButtonElement;
    expect(keepMine.disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Refetch" }));
    expect(onRefetch).toHaveBeenCalledWith(1);
    fireEvent.click(screen.getByRole("button", { name: "Discard my change" }));
    expect(onResolve).toHaveBeenCalledWith(1, expect.objectContaining({ current: null }), "keepTheirs");
  });

  it("disables both resolutions until the server snapshot is loaded", () => {
    renderReview([{ journalId: 1, conflict: { ...entryConflict.conflict, current: undefined } }]);
    expect((screen.getByRole("button", { name: "Keep mine" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Use server value" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Server value not loaded yet")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Refetch" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("disables every action while a refetch is pending so a resolution cannot be duplicated", () => {
    renderReview([{ journalId: 1, conflict: { ...entryConflict.conflict, current: null } }], true);
    expect((screen.getByRole("button", { name: "Keep mine" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Refetching…" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Discard my change" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("JournalConflictReview server value loading", () => {
  const unknownConflict: JournalRegistryConflict = {
    journalId: 1,
    conflict: {
      type: "entry",
      student_id: 101,
      lesson_date: FIRST_DATE,
      submitted_version: 1,
      mine: { attendance: true, score: 5, comment: null },
      current: undefined,
    },
  };

  it("asks for the current server value once on open without any button press", () => {
    const handlers = renderReview([unknownConflict]);
    expect(handlers.onRefetch).toHaveBeenCalledTimes(1);
    expect(handlers.onRefetch).toHaveBeenCalledWith(1);
  });

  it("shows a loading state instead of asking the user to reload while refetching", () => {
    renderReview([unknownConflict], true);
    expect(screen.getByTestId("conflict-server-value").textContent).toContain("Loading the server value");
    expect(screen.queryByText("Server value not loaded yet")).toBeNull();
  });

  it("does not refetch when the server value is already known", () => {
    const handlers = renderReview([entryConflict]);
    expect(handlers.onRefetch).not.toHaveBeenCalled();
  });
});

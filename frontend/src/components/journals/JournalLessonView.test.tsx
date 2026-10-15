import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createRef } from "react";
import i18n from "../../i18n";
import { JournalLessonView } from "./JournalLessonView";
import type { JournalRowEditing } from "./JournalStudentRow";
import type { CellSaveStatus } from "../../lib/journals/journalQueueTypes";
import type { JournalStudentResponse } from "../../lib/journals/types";

const LESSON = "2026-10-14";

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
  });
});

beforeEach(async () => {
  await i18n.changeLanguage("en");
});

afterEach(() => cleanup());

function student(id: number, first: string, entry: { attendance?: boolean; score?: number; comment?: string | null } = {}): JournalStudentResponse {
  return {
    student_id: id,
    first_name: first,
    last_name: "Tester",
    email: "",
    color_hex: "",
    entries: [
      { id: id, lesson_date: LESSON, attendance: entry.attendance ?? false, score: entry.score ?? 0, comment: entry.comment ?? null, has_comment: Boolean(entry.comment), version: 1 },
    ],
    summary: null,
  };
}

const ROSTER = [student(1, "Anvar", { attendance: true, score: 4 }), student(2, "Bahor", { comment: "Needs help" }), student(3, "Chiroq")];

function mount(options: { editing?: boolean; visible?: Set<number> | null; status?: Map<string, CellSaveStatus>; query?: string } = {}) {
  const onEntryCommand = vi.fn();
  const onClearSearch = vi.fn();
  const editing: JournalRowEditing | null = options.editing === false ? null : { onEntryCommand, onSummaryField: vi.fn() };
  const element = (visible: Set<number> | null, status: Map<string, CellSaveStatus>) => (
    <JournalLessonView
      students={ROSTER}
      visibleStudentIds={visible}
      lessonDate={LESSON}
      periodLabel="Month 10"
      cellStatus={status}
      editing={editing}
      searchQuery={options.query ?? ""}
      onClearSearch={onClearSearch}
      onAnchor={() => undefined}
      headingRef={createRef<HTMLHeadingElement>()}
    />
  );
  const view = render(element(options.visible ?? null, options.status ?? new Map()));
  return { onEntryCommand, onClearSearch, rerender: (visible: Set<number> | null, status: Map<string, CellSaveStatus>) => view.rerender(element(visible, status)) };
}

describe("JournalLessonView rows", () => {
  it("renders a full-width wrapping name then labeled attendance, visible score and a named comment action", () => {
    mount();
    const row = document.querySelector('[data-lesson-row="1"]') as HTMLElement;
    expect(within(row).getByText("Anvar Tester").className).toContain("break-words");
    expect(within(row).getByText("Present")).toBeDefined();
    expect(within(row).getByRole("checkbox", { name: "Present: Anvar Tester" })).toBeDefined();
    expect(within(row).getByRole("button", { name: "Score for Anvar Tester: 4. Choose a score" }).textContent).toBe("Score 4");
    expect(within(row).getByRole("button", { name: "Add comment for Anvar Tester" })).toBeDefined();
  });

  it("gives every action a 44px minimum target that wraps instead of squeezing", () => {
    mount();
    const row = document.querySelector('[data-lesson-row="1"]') as HTMLElement;
    const actions = row.querySelector(".flex-wrap") as HTMLElement;
    expect(actions.className).toContain("flex-wrap");
    const targets = [within(row).getByRole("checkbox").closest("label"), ...within(row).getAllByRole("button")];
    expect(targets).toHaveLength(3);
    targets.forEach((target) => expect(target?.className).toMatch(/min-h-11/));
    expect(row.className).toContain("px-4");
  });

  it("shows a visible indicator and a Read or edit accessible name for an existing comment", () => {
    mount();
    const row = document.querySelector('[data-lesson-row="2"]') as HTMLElement;
    const comment = within(row).getByRole("button", { name: "Read or edit comment for Bahor Tester" });
    expect(comment.textContent).toContain("Edit comment");
    expect(comment.querySelector("svg")?.getAttribute("class")).toContain("fill-current");
  });

  it("renders the comment action as a 44px icon button below 640px with a dot badge only when a comment exists", () => {
    mount();
    const withComment = within(document.querySelector('[data-lesson-row="2"]') as HTMLElement).getByRole("button", { name: /Read or edit comment/ });
    const without = within(document.querySelector('[data-lesson-row="1"]') as HTMLElement).getByRole("button", { name: /Add comment for Anvar/ });
    [withComment, without].forEach((button) => {
      expect(button.className).toContain("w-11");
      expect(button.className).toContain("sm:w-auto");
      expect(button.className).toContain("min-h-11");
      expect(button.querySelector("span.hidden.sm\\:inline")).not.toBeNull();
    });
    expect(withComment.querySelector('[data-testid="comment-dot"]')).not.toBeNull();
    expect(withComment.querySelector("svg")?.getAttribute("class")).toContain("fill-current");
    expect(without.querySelector('[data-testid="comment-dot"]')).toBeNull();
  });

  it("fills no score choice when there is no current score and focuses the first choice with the ring only", () => {
    mount();
    const row = document.querySelector('[data-lesson-row="3"]') as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: /Score for Chiroq/ }));
    const choices = screen.getAllByRole("menuitemradio");
    choices.forEach((choice) => {
      expect(choice.getAttribute("aria-checked")).toBe("false");
      expect(choice.className).not.toContain("bg-maroon");
    });
    expect(document.activeElement).toBe(choices[0]);
  });

  it("fills only the current score choice and marks it checked", () => {
    mount();
    const row = document.querySelector('[data-lesson-row="1"]') as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: /Score for Anvar/ }));
    const choices = screen.getAllByRole("menuitemradio");
    const checked = choices.filter((choice) => choice.getAttribute("aria-checked") === "true");
    expect(checked.map((choice) => choice.textContent)).toEqual(["4"]);
    expect(choices.filter((choice) => choice.className.includes("bg-maroon"))).toHaveLength(1);
  });

  it("sends the same absence payload the desktop checkbox and Space send", () => {
    const view = mount();
    const checkbox = within(document.querySelector('[data-lesson-row="1"]') as HTMLElement).getByRole("checkbox");
    fireEvent.click(checkbox);
    expect(view.onEntryCommand).toHaveBeenCalledWith(1, LESSON, { kind: "attendance", attended: false });
  });

  it("opens a bounded score picker, applies a choice, returns focus to the score control and does not advance", () => {
    const view = mount();
    const row = document.querySelector('[data-lesson-row="1"]') as HTMLElement;
    const scoreButton = within(row).getByRole("button", { name: /Score for Anvar Tester/ });
    fireEvent.click(scoreButton);
    const dialog = screen.getByRole("dialog", { name: /Score for Anvar Tester/ });
    const bound = (dialog.parentElement as HTMLElement).getAttribute("style") ?? "";
    expect(bound).toContain("min(320px");
    expect(bound).toContain("100vw");
    expect(bound).toContain("32px");
    expect(dialog.querySelector('[role="menu"]')?.className).toContain("grid-cols-3");
    expect(screen.getAllByRole("menuitemradio")).toHaveLength(6);
    fireEvent.click(screen.getByRole("menuitemradio", { name: "2" }));
    expect(view.onEntryCommand).toHaveBeenCalledWith(1, LESSON, { kind: "score", score: 2 });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(scoreButton);
  });

  it("changes nothing when the picker is dismissed with Escape or Close", () => {
    const view = mount();
    const row = document.querySelector('[data-lesson-row="1"]') as HTMLElement;
    const scoreButton = within(row).getByRole("button", { name: /Score for Anvar Tester/ });
    fireEvent.click(scoreButton);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(scoreButton);
    fireEvent.click(scoreButton);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(view.onEntryCommand).not.toHaveBeenCalled();
  });

  it("keeps the marker footprint reserved so an acknowledgement does not change the row structure", () => {
    const view = mount();
    const slotBefore = document.querySelectorAll('[data-testid="lesson-marker-slot"]');
    expect(slotBefore).toHaveLength(3);
    const heightClass = (slotBefore[0] as HTMLElement).className;
    view.rerender(null, new Map<string, CellSaveStatus>([[`1:${LESSON}`, "saved"]]));
    const slotAfter = document.querySelectorAll('[data-testid="lesson-marker-slot"]');
    expect((slotAfter[0] as HTMLElement).className).toBe(heightClass);
    expect(heightClass).toMatch(/h-5/);
    expect(slotAfter[0].querySelector('[data-testid="save-marker"]')).not.toBeNull();
  });

  it("explains a failed or conflicted row in an expanding line", () => {
    mount({ status: new Map<string, CellSaveStatus>([[`2:${LESSON}`, "error"], [`3:${LESSON}`, "conflict"]]) });
    expect(screen.getByText("This change was not saved. Use Retry in the status line.")).toBeDefined();
    expect(screen.getByText("This change conflicts with newer data. Use Review in the status line.")).toBeDefined();
  });

  it("mounts no editors in read-only mode but still shows attendance, score and the comment indicator", () => {
    mount({ editing: false });
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.getByText("Score 4")).toBeDefined();
    expect(screen.getByText("Has a comment")).toBeDefined();
  });
});

describe("JournalLessonView search scope", () => {
  it("shows only visible students in stable source order and sends commands by student identity", () => {
    const view = mount({ visible: new Set([3, 1]), query: "a" });
    const names = screen.getAllByText(/Tester/).map((node) => node.textContent);
    expect(names).toEqual(["Anvar Tester", "Chiroq Tester"]);
    fireEvent.click(within(document.querySelector('[data-lesson-row="3"]') as HTMLElement).getByRole("checkbox"));
    expect(view.onEntryCommand).toHaveBeenCalledWith(3, LESSON, { kind: "attendance", attended: true });
  });

  it("shows a no-match state with a Clear action, distinct from the no-students copy", () => {
    const view = mount({ visible: new Set<number>(), query: "zzz" });
    expect(screen.getByText("No students match")).toBeDefined();
    expect(screen.getByText(/Nobody in this period's roster matches “zzz”/)).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(view.onClearSearch).toHaveBeenCalled();
    expect(screen.queryByText("There are no students in this course")).toBeNull();
  });
});

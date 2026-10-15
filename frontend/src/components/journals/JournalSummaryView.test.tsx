import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import i18n from "../../i18n";
import { JournalSummaryView } from "./JournalSummaryView";
import { JournalSummaryEditor } from "./JournalSummaryEditor";
import type { CellSaveStatus } from "../../lib/journals/journalQueueTypes";
import type { JournalStudentResponse } from "../../lib/journals/types";

const viewport = vi.hoisted(() => {
  const state = { desktop: true };
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      get matches() {
        return query.includes("1024px") ? state.desktop : false;
      },
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
  return state;
});

function summary(overrides: Partial<NonNullable<JournalStudentResponse["summary"]>> = {}) {
  return {
    id: 1, journal_id: 1, student_id: 1, homework_score: 40, attendance_score: 10, exam_score: 30, bonus_score: 5,
    sum_score: 85, max_period_score: 100, percentage: 85, attendance_count: 10, total_lessons: 12, version: 7, ...overrides,
  };
}

function student(id: number, first: string, value: JournalStudentResponse["summary"]): JournalStudentResponse {
  return {
    student_id: id, first_name: first, last_name: "Tester", email: "", color_hex: "",
    entries: [
      { id: id * 10, lesson_date: "2026-10-12", attendance: true, score: 4, comment: "Strong work", has_comment: true, version: 1 },
      { id: id * 10 + 1, lesson_date: "2026-10-14", attendance: false, score: 0, comment: null, has_comment: false, version: 1 },
    ],
    summary: value,
  };
}

const ROSTER = [student(1, "Anvar", summary({ sum_score: 125, percentage: 111.6, max_period_score: 112 })), student(2, "Bahor", null), student(3, "Chiroq", summary({ sum_score: 0, percentage: 0 }))];

function Harness({ onApplyPair, profile }: { onApplyPair: ((id: number, v: { bonus_score: number; exam_score: number; version: number }) => void) | null; profile: boolean }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <MemoryRouter>
      <JournalSummaryView
        students={ROSTER}
        allStudents={ROSTER}
        lessonDates={["2026-10-12", "2026-10-14"]}
        examMaximum={40}
        periodLabel="Month 10"
        summaryStatus={new Map<number, CellSaveStatus>()}
        onApplyPair={onApplyPair}
        profileHrefFor={(id) => (profile ? `/students/${id}` : null)}
        openStudentId={open}
        onOpenStudent={setOpen}
      />
    </MemoryRouter>
  );
}

beforeEach(async () => {
  viewport.desktop = true;
  await i18n.changeLanguage("en");
});

afterEach(() => cleanup());

describe.each([["desktop", true], ["narrow", false]])("JournalSummaryView %s", (_label, desktop) => {
  beforeEach(() => {
    viewport.desktop = desktop;
  });

  it("reads Unavailable for a missing summary and shows a true zero as 0", () => {
    render(<Harness onApplyPair={null} profile={false} />);
    expect(screen.getAllByText("Unavailable")).toHaveLength(1);
    expect(screen.getAllByText(/^0 \/ 100$/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("0%").length).toBeGreaterThan(0);
  });

  it("displays a percentage above 100 exactly as supplied", () => {
    render(<Harness onApplyPair={null} profile={false} />);
    expect(screen.getAllByText("111.6%").length).toBe(1);
    expect(screen.getAllByText("125 / 112").length).toBe(1);
  });

  it("offers no edit action to read-only roles", () => {
    render(<Harness onApplyPair={null} profile={false} />);
    expect(screen.queryByRole("button", { name: /Edit exam and bonus/ })).toBeNull();
  });

  it("renders the edit action as a quiet ghost with an Edit label, primary text, no border and a 44px target", () => {
    render(<Harness onApplyPair={vi.fn()} profile={false} />);
    const action = screen.getAllByRole("button", { name: /Edit exam and bonus for/ })[0];
    expect(action.textContent).toBe("Edit");
    expect(action.className).toContain("text-maroon");
    expect(action.className).toContain("min-h-11");
    expect(action.className).not.toMatch(/\bborder\b/);
  });

  it("gives student names a link affordance, with a chevron cue only on narrow rows", () => {
    render(<Harness onApplyPair={null} profile={false} />);
    const name = screen.getByRole("button", { name: "Open breakdown for Anvar Tester" });
    expect(name.className).toContain("hover:text-maroon");
    expect(name.className).toContain("hover:underline");
    expect(name.className).toContain("focus-visible:underline");
    expect(Boolean(name.querySelector("svg"))).toBe(!desktop);
  });

  it("formats every percentage with one rule and the active locale", async () => {
    await i18n.changeLanguage("ru");
    render(<Harness onApplyPair={null} profile={false} />);
    expect(screen.getAllByText("111,6%").length).toBe(1);
    expect(screen.getAllByText("0%").length).toBeGreaterThan(0);
    expect(screen.queryByText(/\.\d%/)).toBeNull();
  });

  it("offers an edit action only for students that have a summary", () => {
    render(<Harness onApplyPair={vi.fn()} profile={false} />);
    expect(screen.getAllByRole("button", { name: /Edit exam and bonus for/ })).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Edit exam and bonus for Bahor Tester" })).toBeNull();
  });
});

describe("student period breakdown", () => {
  it("opens in place from the name, shows the same components and lesson list, and Back restores focus to the row", () => {
    render(<Harness onApplyPair={vi.fn()} profile={false} />);
    const opener = screen.getByRole("button", { name: "Open breakdown for Anvar Tester" });
    opener.focus();
    fireEvent.click(opener);
    const heading = screen.getByRole("heading", { name: "Anvar Tester" });
    expect(document.activeElement).toBe(heading);
    expect(screen.getByText("Homework")).toBeDefined();
    expect(screen.getAllByText("Bonus").length).toBeGreaterThan(0);
    expect(screen.getByText("Strong work")).toBeDefined();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Back to summary" }));
    return new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        expect(document.activeElement).toBe(screen.getByRole("button", { name: "Open breakdown for Anvar Tester" }));
        resolve();
      });
    });
  });

  it("reads Unavailable in the breakdown of a student without a summary", () => {
    render(<Harness onApplyPair={vi.fn()} profile={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Open breakdown for Bahor Tester" }));
    expect(screen.getByText("Unavailable")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Edit exam and bonus" })).toBeNull();
    expect(screen.queryByText("How this total is calculated")).toBeNull();
  });

  it("shows View profile only when the destination guard permits it", () => {
    const { unmount } = render(<Harness onApplyPair={null} profile />);
    fireEvent.click(screen.getByRole("button", { name: "Open breakdown for Anvar Tester" }));
    expect(screen.getByRole("link", { name: "View profile" }).getAttribute("href")).toBe("/students/1");
    unmount();
    render(<Harness onApplyPair={null} profile={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Open breakdown for Anvar Tester" }));
    expect(screen.queryByRole("link", { name: "View profile" })).toBeNull();
  });

  it("explains the total with the server values and the verified rules", () => {
    render(<Harness onApplyPair={null} profile={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Open breakdown for Anvar Tester" }));
    fireEvent.click(screen.getByRole("button", { name: "How this total is calculated" }));
    expect(screen.getByText("Homework 40 + attendance 10 + exam 30 + bonus 5 = 125")).toBeDefined();
    expect(screen.getByText("Maximum 112 = 12 lessons × 6 points + exam maximum 40")).toBeDefined();
    expect(screen.getByText("Percentage = 125 ÷ 112 = 111.6%")).toBeDefined();
    expect(screen.getByText("Bonus: up to 20 points.")).toBeDefined();
    expect(screen.getByText("Bonus can push the percentage above 100%.")).toBeDefined();
  });

  it("falls back to the server maximum when the formula does not reproduce it", () => {
    render(<Harness onApplyPair={null} profile={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Open breakdown for Chiroq Tester" }));
    fireEvent.click(screen.getByRole("button", { name: "How this total is calculated" }));
    expect(screen.queryByText(/lessons × 6 points/)).toBeNull();
    expect(screen.getByText("Maximum 100, as calculated by the server")).toBeDefined();
  });
});

describe("paired exam and bonus editor", () => {
  function openEditor() {
    const onApply = vi.fn();
    render(<Harness onApplyPair={onApply} profile={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit exam and bonus for Anvar Tester" }));
    const dialog = screen.getByRole("dialog", { name: "Edit exam and bonus: Anvar Tester" });
    return { onApply, dialog, bonus: within(dialog).getByLabelText("Bonus") as HTMLInputElement, exam: within(dialog).getByLabelText("Exam") as HTMLInputElement, apply: within(dialog).getByRole("button", { name: "Apply" }) as HTMLButtonElement };
  }

  it("shows both current values, the allowed ranges, the current total and 16px inputs", () => {
    const { dialog, bonus, exam } = openEditor();
    expect(bonus.value).toBe("5");
    expect(exam.value).toBe("30");
    expect(bonus.className).toContain("text-base");
    expect(dialog.textContent).toContain("Whole number from 0 to 20");
    expect(dialog.textContent).toContain("Whole number from 0 to 40");
    expect(dialog.textContent).toContain("Current total: 125 of 112");
  });

  it("keeps Apply disabled for an unchanged draft", () => {
    const { apply } = openEditor();
    expect(apply.disabled).toBe(true);
  });

  it.each([["", "wholeNumber"], ["abc", "wholeNumber"], ["1.5", "wholeNumber"], ["-2", "wholeNumber"], ["21", "max"]])(
    "rejects the bonus %j inline, keeps the text and never sends a zero",
    (raw, kind) => {
      const { onApply, bonus, apply } = openEditor();
      fireEvent.change(bonus, { target: { value: raw } });
      expect(bonus.value).toBe(raw);
      expect(bonus.getAttribute("aria-invalid")).toBe("true");
      expect(screen.getByRole("alert").textContent).toBe(kind === "max" ? "Max 20" : "Enter a whole number");
      expect(apply.disabled).toBe(true);
      fireEvent.click(apply);
      expect(onApply).not.toHaveBeenCalled();
    },
  );

  it("rejects an exam above the journal maximum without clamping", () => {
    const { exam, apply, onApply } = openEditor();
    fireEvent.change(exam, { target: { value: "41" } });
    expect(screen.getByRole("alert").textContent).toBe("Max 40");
    expect(exam.value).toBe("41");
    expect(apply.disabled).toBe(true);
    expect(onApply).not.toHaveBeenCalled();
  });

  it("applies both values from one paired draft with the current version, closes, and prevents a duplicate", () => {
    const { onApply, bonus, exam, apply } = openEditor();
    fireEvent.change(bonus, { target: { value: "12" } });
    fireEvent.change(exam, { target: { value: "35" } });
    fireEvent.click(apply);
    fireEvent.click(apply);
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith(1, { bonus_score: 12, exam_score: 35, version: 7 });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("applies with Enter inside a field", () => {
    const { onApply, bonus } = openEditor();
    fireEvent.change(bonus, { target: { value: "9" } });
    fireEvent.submit(bonus.closest("form") as HTMLFormElement);
    expect(onApply).toHaveBeenCalledWith(1, { bonus_score: 9, exam_score: 30, version: 7 });
  });

  it("sends nothing on Cancel", () => {
    const { onApply, bonus, dialog } = openEditor();
    fireEvent.change(bonus, { target: { value: "9" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes a pristine editor on Escape but keeps a dirty one and offers Continue editing or Discard", () => {
    const first = openEditor();
    fireEvent.keyDown(first.bonus, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    cleanup();

    const { onApply, bonus } = openEditor();
    fireEvent.change(bonus, { target: { value: "9" } });
    fireEvent.keyDown(bonus, { key: "Escape" });
    expect(screen.getByRole("dialog")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Continue editing" }));
    expect((screen.getByLabelText("Bonus") as HTMLInputElement).value).toBe("9");
    fireEvent.keyDown(screen.getByLabelText("Bonus"), { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onApply).not.toHaveBeenCalled();
  });
});

describe("JournalSummaryEditor background refresh", () => {
  function mount(bonus: number, exam: number) {
    return (
      <JournalSummaryEditor studentName="Aziza" bonusScore={bonus} examScore={exam} examMaximum={40} currentTotal={50} maximumTotal={100} onApply={vi.fn()} onClose={vi.fn()} />
    );
  }

  it("synchronizes pristine fields with refreshed server values but never overwrites a dirty field", () => {
    const { rerender } = render(mount(5, 30));
    fireEvent.change(screen.getByLabelText("Bonus"), { target: { value: "9" } });
    rerender(mount(6, 31));
    expect((screen.getByLabelText("Bonus") as HTMLInputElement).value).toBe("9");
    expect((screen.getByLabelText("Exam") as HTMLInputElement).value).toBe("31");
  });
});

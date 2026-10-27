import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "../../i18n";
import { formatSchoolLessonDate } from "../../i18n/formatters";
import { JournalScoreCell } from "./JournalScoreCell";
import type { CellSaveStatus } from "../../lib/journals/journalQueueTypes";

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: () => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} }),
  });
});

afterEach(() => cleanup());

function renderCell(overrides: { attendance?: boolean; score?: number; graded?: boolean; disabled?: boolean; rejectionMessage?: string; comment?: string | null; status?: CellSaveStatus } = {}) {
  const onCommand = vi.fn();
  const onNavigate = vi.fn();
  render(
    <JournalScoreCell
      studentName="Aziza Rahimova"
      lessonDate="2026-08-01"
      attendance={overrides.attendance ?? true}
      score={overrides.score ?? 4}
      graded={overrides.graded ?? (overrides.score ?? 4) > 0}
      disabled={overrides.disabled}
      rejectionMessage={overrides.rejectionMessage}
      comment={overrides.comment ?? "Note"}
      status={overrides.status}
      isFocused
      onFocus={() => undefined}
      onNavigate={onNavigate}
      onCommand={onCommand}
    />,
  );
  return { onCommand, onNavigate, cell: screen.queryByLabelText(`Score for Aziza Rahimova on ${formatSchoolLessonDate("2026-08-01")}`) ?? screen.getByTestId("future-cell") };
}

describe("JournalScoreCell commands", () => {
  it("emits the same absence command for Space and for unchecking the attendance checkbox", () => {
    const space = renderCell();
    fireEvent.keyDown(space.cell, { key: " ", code: "Space" });
    const spaceCommand = space.onCommand.mock.calls[0][0];
    cleanup();

    const checkbox = renderCell();
    fireEvent.click(screen.getByRole("checkbox"));
    const checkboxCommand = checkbox.onCommand.mock.calls[0][0];

    expect(spaceCommand).toEqual({ kind: "attendance", attended: false });
    expect(checkboxCommand).toEqual(spaceCommand);
  });

  it("emits a score command for digit keys and moves down", () => {
    const { cell, onCommand, onNavigate } = renderCell({ attendance: false, score: 0 });
    fireEvent.keyDown(cell, { key: "3" });
    expect(onCommand).toHaveBeenCalledWith({ kind: "score", score: 3 });
    expect(onNavigate).toHaveBeenCalledWith("down");
  });

  it("emits a score zero command for Backspace so attendance is left to the owner", () => {
    const { cell, onCommand } = renderCell();
    fireEvent.keyDown(cell, { key: "Backspace" });
    expect(onCommand).toHaveBeenCalledWith({ kind: "score", score: 0 });
  });

  it("emits a score command from the pointer picker", () => {
    const { onCommand } = renderCell({ attendance: false, score: 0 });
    fireEvent.click(screen.getByRole("button", { name: "—" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "5" }));
    expect(onCommand).toHaveBeenCalledWith({ kind: "score", score: 5 });
  });

  it("saves a whitespace-only comment as an explicit clear", () => {
    const { onCommand } = renderCell();
    fireEvent.click(screen.getByLabelText(`Comment for Aziza Rahimova on ${formatSchoolLessonDate("2026-08-01")}`));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onCommand).toHaveBeenCalledWith({ kind: "comment", comment: "" });
  });

  it.each([
    ["dirty", "Unsaved change"],
    ["saving", "Saving"],
    ["saved", "Saved"],
    ["error", "Not saved"],
    ["conflict", "Conflict"],
  ] as const)("shows a shaped marker with accessible text for %s", (status, text) => {
    renderCell({ status });
    const marker = screen.getByTestId("save-marker");
    expect(marker.getAttribute("data-status")).toBe(status);
    expect(marker.querySelector("svg")).not.toBeNull();
    expect(marker.textContent).toBe(text);
  });

describe("JournalScoreCell overlays", () => {
  it("moves focus into the comment textarea when C opens the editor so typed keys never reach the cell", async () => {
    const { cell, onCommand, onNavigate } = renderCell();
    cell.focus();
    fireEvent.keyDown(cell, { key: "c" });
    const textarea = screen.getByRole("textbox");
    await waitFor(() => expect(document.activeElement).toBe(textarea));
    fireEvent.keyDown(textarea, { key: "5" });
    fireEvent.keyDown(textarea, { key: " ", code: "Space" });
    expect(onCommand).not.toHaveBeenCalled();
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("moves focus to the selected option when the score picker opens and returns it to the score control on Escape without a change", () => {
    const { onCommand } = renderCell({ score: 3 });
    const scoreButton = screen.getByRole("button", { name: "3" });
    fireEvent.click(scoreButton);
    expect(document.activeElement).toBe(screen.getByRole("menuitemradio", { name: "3" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(scoreButton);
    expect(onCommand).not.toHaveBeenCalled();
  });

  it("returns focus to the score control after a choice and does not advance", () => {
    const { onCommand, onNavigate } = renderCell({ score: 3 });
    const scoreButton = screen.getByRole("button", { name: "3" });
    fireEvent.click(scoreButton);
    fireEvent.click(screen.getByRole("menuitemradio", { name: "5" }));
    expect(onCommand).toHaveBeenCalledWith({ kind: "score", score: 5 });
    expect(onNavigate).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(scoreButton);
  });

  it("roves focus along the single row of six choices with the arrow keys", () => {
    renderCell({ score: 3 });
    fireEvent.click(screen.getByRole("button", { name: "3" }));
    const choice = (name: string) => screen.getByRole("menuitemradio", { name });
    fireEvent.keyDown(choice("3"), { key: "ArrowRight" });
    expect(document.activeElement).toBe(choice("4"));
    fireEvent.keyDown(choice("4"), { key: "ArrowRight" });
    fireEvent.keyDown(choice("5"), { key: "ArrowRight" });
    expect(document.activeElement).toBe(choice("5"));
    fireEvent.keyDown(choice("5"), { key: "ArrowLeft" });
    expect(document.activeElement).toBe(choice("4"));
    fireEvent.keyDown(choice("4"), { key: "Home" });
    expect(document.activeElement).toBe(choice("0"));
    fireEvent.keyDown(choice("0"), { key: "End" });
    expect(document.activeElement).toBe(choice("5"));
  });

  it("sets a grade directly from a digit key while the picker is focused", () => {
    const { onCommand } = renderCell({ score: 3 });
    fireEvent.click(screen.getByRole("button", { name: "3" }));
    fireEvent.keyDown(screen.getByRole("menuitemradio", { name: "3" }), { key: "1" });
    expect(onCommand).toHaveBeenCalledWith({ kind: "score", score: 1 });
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("is a minimal popover: one segmented row of six choices from 0 to 5, no title, student, date, current-score line, help text or close button", () => {
    const { onCommand } = renderCell({ score: 3, attendance: true });
    fireEvent.click(screen.getByRole("button", { name: "3" }));
    const menu = screen.getByRole("menu", { name: /Score for Aziza Rahimova, / });
    expect(menu.textContent).toBe("012345");
    const popover = menu.parentElement as HTMLElement;
    expect(popover.textContent).toBe("012345");
    expect(screen.queryByRole("dialog", { name: /Score for/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
    expect(screen.queryByText(/Current score/)).toBeNull();
    expect(screen.queryByText(/mark the student present/)).toBeNull();
    screen.getAllByRole("menuitemradio").forEach((choice) => expect(choice.className).toContain("h-8"));
    expect(screen.getByRole("menuitemradio", { name: "3" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.pointerDown(document.body);
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(onCommand).not.toHaveBeenCalled();
  });

  it("offers 0 as a real choice next to 1 to 5", () => {
    renderCell({ score: 0 });
    fireEvent.click(screen.getByRole("button", { name: "—" }));
    const choices: string[] = screen.getAllByRole("menuitemradio").map((choice) => choice.textContent ?? "");
    expect(choices).toEqual(["0", "1", "2", "3", "4", "5"]);
    expect(screen.queryByRole("menuitem", { name: "Clear" })).toBeNull();
  });

  it("grades zero from the picker and from Backspace, Delete and the 0 key", () => {
    const { cell, onCommand } = renderCell({ score: 3 });
    fireEvent.click(screen.getByRole("button", { name: "3" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "0" }));
    expect(onCommand).toHaveBeenLastCalledWith({ kind: "score", score: 0 });
    expect(screen.queryByRole("menu")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "3" }));
    fireEvent.keyDown(screen.getByRole("menuitemradio", { name: "3" }), { key: "Backspace" });
    expect(onCommand).toHaveBeenLastCalledWith({ kind: "score", score: 0 });
    cell.focus();
    fireEvent.keyDown(cell, { key: "0" });
    fireEvent.keyDown(cell, { key: "Delete" });
    expect(onCommand).toHaveBeenCalledTimes(4);
    expect(onCommand).toHaveBeenNthCalledWith(3, { kind: "score", score: 0 });
    expect(onCommand).toHaveBeenNthCalledWith(4, { kind: "score", score: 0 });
  });

  it("applies the dirty-dismissal rule to the desktop comment editor and returns focus to the cell", async () => {
    const { cell, onCommand } = renderCell({ comment: null });
    cell.focus();
    fireEvent.keyDown(cell, { key: "c" });
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "Draft" } });
    fireEvent.keyDown(textarea, { key: "Escape" });
    expect(screen.getByRole("button", { name: "Continue editing" })).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Discard comment changes" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(onCommand).not.toHaveBeenCalled();
    await waitFor(() => expect(document.activeElement).toBe(cell));
  });

  it("animates the popover in over 150ms and leaves a 100ms exit ghost without delaying the closing", () => {
    const animate = vi.fn<(...animationArguments: [Keyframe[], KeyframeAnimationOptions]) => { onfinish: null; oncancel: null }>(() => ({ onfinish: null, oncancel: null }));
    Object.defineProperty(HTMLElement.prototype, "animate", { configurable: true, writable: true, value: animate });
    const originalMatchMedia = window.matchMedia;
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: (query: string) => ({ matches: !query.includes("prefers-reduced-motion"), addEventListener: () => {}, removeEventListener: () => {} }),
    });
    const { onCommand } = renderCell({ score: 3 });
    fireEvent.click(screen.getByRole("button", { name: "3" }));
    const opening = animate.mock.calls.find(([frames]) => frames[0].transform === "scale(0.96)" && frames[0].opacity === 0);
    expect(opening?.[1]).toMatchObject({ duration: 150 });
    fireEvent.keyDown(screen.getByRole("menuitemradio", { name: "3" }), { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(animate.mock.calls.some(([, options]) => options.duration === 100)).toBe(true);
    expect(onCommand).not.toHaveBeenCalled();
    Reflect.deleteProperty(HTMLElement.prototype, "animate");
    Object.defineProperty(window, "matchMedia", { configurable: true, writable: true, value: originalMatchMedia });
    document.querySelectorAll("[inert]").forEach((node) => node.remove());
  });

  it("makes the inner controls tab stops only while the cell is the focused cell", () => {
    renderCell();
    expect(screen.getByRole("checkbox").getAttribute("tabindex")).toBe("0");
  });

  it("ignores the shortcut keys while the attendance checkbox itself has focus", () => {
    const { onCommand } = renderCell();
    const checkbox = screen.getByRole("checkbox");
    checkbox.focus();
    fireEvent.keyDown(checkbox, { key: "4" });
    fireEvent.keyDown(checkbox, { key: "c" });
    expect(onCommand).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
});

describe("JournalScoreCell desktop score popover", () => {
  it("closes on Tab and hands focus back to the score control so two popovers cannot be open", () => {
    renderCell({ attendance: false, score: 0 });
    const scoreButton = screen.getByRole("button", { name: "—" });
    fireEvent.click(scoreButton);
    const choice = screen.getByRole("menuitemradio", { name: "3" });
    expect(document.activeElement?.closest('[role="menu"]')).not.toBeNull();
    fireEvent.keyDown(choice, { key: "Tab" });
    expect(screen.queryByRole("menuitemradio", { name: "3" })).toBeNull();
    expect(document.activeElement).toBe(scoreButton);
  });
});

describe("JournalScoreCell grading states", () => {
  it("shows a dash for a cell that is not graded and 0 for a cell graded zero", () => {
    renderCell({ attendance: false, score: 0, graded: false });
    const ungraded: HTMLElement = screen.getByRole("button", { name: "—" });
    expect(ungraded.getAttribute("data-graded")).toBe("false");
    cleanup();
    renderCell({ attendance: true, score: 0, graded: true });
    const zero: HTMLElement = screen.getByRole("button", { name: "0" });
    expect(zero.getAttribute("data-graded")).toBe("true");
    expect(zero.textContent).toBe("0");
  });

  it("renders a future lesson as a disabled cell without attendance, score or comment controls", () => {
    const { cell, onCommand } = renderCell({ disabled: true, attendance: false, score: 0 });
    expect(screen.getByTestId("future-cell").getAttribute("aria-disabled")).toBe("true");
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    fireEvent.keyDown(screen.getByTestId("future-cell"), { key: "4" });
    fireEvent.keyDown(screen.getByTestId("future-cell"), { key: " ", code: "Space" });
    expect(onCommand).not.toHaveBeenCalled();
    expect(cell).toBeTruthy();
  });

  it("still moves focus off a disabled future cell with the arrow keys", () => {
    const { onNavigate } = renderCell({ disabled: true });
    fireEvent.keyDown(screen.getByTestId("future-cell"), { key: "ArrowDown" });
    expect(onNavigate).toHaveBeenCalledWith("down");
  });

  it("exposes the server rejection message on the cell and keeps the score control", () => {
    renderCell({ rejectionMessage: "The lesson has not happened yet. Your entry is kept.", status: "error" });
    expect(screen.getByRole("alert").textContent).toBe("The lesson has not happened yet. Your entry is kept.");
    expect(screen.getByRole("button", { name: "4" })).toBeTruthy();
  });
});

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

function renderCell(overrides: { attendance?: boolean; score?: number; comment?: string | null; status?: CellSaveStatus } = {}) {
  const onCommand = vi.fn();
  const onNavigate = vi.fn();
  render(
    <JournalScoreCell
      studentName="Aziza Rahimova"
      lessonDate="2026-08-01"
      attendance={overrides.attendance ?? true}
      score={overrides.score ?? 4}
      comment={overrides.comment ?? "Note"}
      status={overrides.status}
      isFocused
      onFocus={() => undefined}
      onNavigate={onNavigate}
      onCommand={onCommand}
    />,
  );
  return { onCommand, onNavigate, cell: screen.getByLabelText(`Score for Aziza Rahimova on ${formatSchoolLessonDate("2026-08-01")}`) };
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

  it("roves focus between the six choices with the arrow keys", () => {
    renderCell({ score: 3 });
    fireEvent.click(screen.getByRole("button", { name: "3" }));
    const choice = (name: string) => screen.getByRole("menuitemradio", { name });
    fireEvent.keyDown(choice("3"), { key: "ArrowRight" });
    expect(document.activeElement).toBe(choice("4"));
    fireEvent.keyDown(choice("4"), { key: "ArrowDown" });
    expect(document.activeElement).toBe(choice("5"));
    fireEvent.keyDown(choice("5"), { key: "ArrowDown" });
    expect(document.activeElement).toBe(choice("5"));
    fireEvent.keyDown(choice("5"), { key: "ArrowUp" });
    expect(document.activeElement).toBe(choice("2"));
    fireEvent.keyDown(choice("2"), { key: "ArrowLeft" });
    expect(document.activeElement).toBe(choice("1"));
    fireEvent.keyDown(choice("1"), { key: "Home" });
    expect(document.activeElement).toBe(choice("0"));
  });

  it("shows student, date, current score and presence context in the picker and closes with its Close button", () => {
    const { onCommand } = renderCell({ score: 3, attendance: true });
    fireEvent.click(screen.getByRole("button", { name: "3" }));
    const dialog = screen.getByRole("dialog", { name: /Score for Aziza Rahimova/ });
    expect(dialog.textContent).toContain("Aziza Rahimova");
    expect(dialog.textContent).toContain("Current score: 3");
    expect(dialog.textContent).toContain("Present");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("menu")).toBeNull();
    expect(onCommand).not.toHaveBeenCalled();
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

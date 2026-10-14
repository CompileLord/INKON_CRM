import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "../../i18n";
import { formatSchoolLessonDate } from "../../i18n/formatters";
import { JournalScoreCell } from "./JournalScoreCell";
import type { CellSaveStatus } from "../../lib/journals/journalQueueTypes";

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

  it("emits the raw comment draft so the command layer trims and clears it", () => {
    const { onCommand } = renderCell();
    fireEvent.click(screen.getByLabelText(`Comment for Aziza Rahimova on ${formatSchoolLessonDate("2026-08-01")}`));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onCommand).toHaveBeenCalledWith({ kind: "comment", comment: "   " });
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
  it("moves focus into the comment textarea when C opens the editor so typed keys never reach the cell", () => {
    const { cell, onCommand, onNavigate } = renderCell();
    cell.focus();
    fireEvent.keyDown(cell, { key: "c" });
    const textarea = screen.getByRole("textbox");
    expect(document.activeElement).toBe(textarea);
    fireEvent.keyDown(textarea, { key: "5" });
    fireEvent.keyDown(textarea, { key: " ", code: "Space" });
    expect(onCommand).not.toHaveBeenCalled();
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("moves focus to the selected option when the score picker opens and returns it to the cell on Escape", () => {
    const { cell } = renderCell({ score: 3 });
    fireEvent.click(screen.getByRole("button", { name: "3" }));
    expect(document.activeElement).toBe(screen.getByRole("menuitemradio", { name: "3" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(cell);
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

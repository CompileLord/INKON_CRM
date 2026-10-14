import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "../../i18n";
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
  return { onCommand, onNavigate, cell: screen.getByLabelText("Score for Aziza Rahimova on 2026-08-01") };
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
    fireEvent.click(screen.getByLabelText("Comment for Aziza Rahimova on 2026-08-01"));
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
});

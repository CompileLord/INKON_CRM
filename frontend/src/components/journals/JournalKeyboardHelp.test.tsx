import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import i18n from "../../i18n";
import { JournalKeyboardHelp } from "./JournalKeyboardHelp";

beforeEach(async () => {
  await i18n.changeLanguage("en");
});

afterEach(() => cleanup());

describe("JournalKeyboardHelp", () => {
  it("is a labeled control that opens translated shortcut help and closes on Escape returning focus", () => {
    render(<JournalKeyboardHelp />);
    const help = screen.getByRole("button", { name: "Keyboard help" });
    expect(help.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(help);
    expect(help.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("region", { name: "Keyboard shortcuts" })).toBeDefined();
    expect(screen.getByText("Space")).toBeDefined();
    expect(screen.getByText("Toggle attendance and move down")).toBeDefined();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("region", { name: "Keyboard shortcuts" })).toBeNull();
    expect(document.activeElement).toBe(help);
  });

  it("carries the score rule that used to sit in the score picker", () => {
    render(<JournalKeyboardHelp />);
    fireEvent.click(screen.getByRole("button", { name: "Keyboard help" }));
    expect(screen.getByText("Scores 1–5 mark the student present. Marking absent resets the lesson score.")).toBeDefined();
  });

  it("closes when the pointer goes elsewhere", () => {
    render(<JournalKeyboardHelp />);
    fireEvent.click(screen.getByRole("button", { name: "Keyboard help" }));
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("region", { name: "Keyboard shortcuts" })).toBeNull();
  });

  it("translates the control and the shortcut keys into Russian and Tajik", async () => {
    render(<JournalKeyboardHelp />);
    await act(async () => {
      await i18n.changeLanguage("ru");
    });
    fireEvent.click(screen.getByRole("button", { name: "Горячие клавиши" }));
    expect(screen.getByText("Пробел")).toBeDefined();
    await act(async () => {
      await i18n.changeLanguage("tg");
    });
    expect(screen.getByRole("button", { name: "Тугмаҳои тез" })).toBeDefined();
    expect(screen.getByText("Фосила")).toBeDefined();
  });
});

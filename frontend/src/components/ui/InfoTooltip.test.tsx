import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InfoTooltip } from "./InfoTooltip";

function renderTooltip() {
  return render(
    <div>
      <InfoTooltip label="What is this">Explanation text</InfoTooltip>
      <button type="button">Elsewhere</button>
    </div>,
  );
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("InfoTooltip", () => {
  it("starts closed and exposes a button with an accessible name", () => {
    renderTooltip();
    expect(screen.getByRole("button", { name: "What is this" }).getAttribute("aria-describedby")).toBeNull();
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  describe("pointer hover", () => {
    beforeEach(() => vi.useFakeTimers());

    it("opens only after about 500ms of mouse hover and links the description", () => {
      renderTooltip();
      const button = screen.getByRole("button", { name: "What is this" });
      fireEvent.pointerEnter(button, { pointerType: "mouse" });
      act(() => vi.advanceTimersByTime(499));
      expect(screen.queryByRole("tooltip")).toBeNull();
      act(() => vi.advanceTimersByTime(1));
      const tooltip = screen.getByRole("tooltip");
      expect(tooltip.textContent).toBe("Explanation text");
      expect(button.getAttribute("aria-describedby")).toBe(tooltip.id);
    });

    it("never opens when the pointer leaves before the delay and closes on leave", () => {
      renderTooltip();
      const button = screen.getByRole("button", { name: "What is this" });
      fireEvent.pointerEnter(button, { pointerType: "mouse" });
      act(() => vi.advanceTimersByTime(300));
      fireEvent.pointerLeave(button, { pointerType: "mouse" });
      act(() => vi.advanceTimersByTime(1000));
      expect(screen.queryByRole("tooltip")).toBeNull();
      fireEvent.pointerEnter(button, { pointerType: "mouse" });
      act(() => vi.advanceTimersByTime(500));
      expect(screen.getByRole("tooltip")).toBeTruthy();
      fireEvent.pointerLeave(button, { pointerType: "mouse" });
      expect(screen.queryByRole("tooltip")).toBeNull();
    });

    it("does not apply the hover delay to touch pointers", () => {
      renderTooltip();
      const button = screen.getByRole("button", { name: "What is this" });
      fireEvent.pointerEnter(button, { pointerType: "touch" });
      act(() => vi.advanceTimersByTime(1000));
      expect(screen.queryByRole("tooltip")).toBeNull();
    });
  });

  it("opens immediately on keyboard focus and closes on blur", async () => {
    renderTooltip();
    await userEvent.tab();
    expect(screen.getByRole("tooltip")).toBeTruthy();
    await userEvent.tab();
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("toggles on tap without the focus event cancelling the open", async () => {
    renderTooltip();
    const button = screen.getByRole("button", { name: "What is this" });
    await userEvent.click(button);
    expect(screen.getByRole("tooltip")).toBeTruthy();
    await userEvent.click(button);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("closes on Escape and on a press elsewhere", async () => {
    renderTooltip();
    await userEvent.tab();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("tooltip")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "What is this" }));
    expect(screen.getByRole("tooltip")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Elsewhere" }));
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("arrives with a 150ms opacity and scale transition that has a reduced-motion path", async () => {
    renderTooltip();
    await userEvent.tab();
    const className = screen.getByRole("tooltip").className;
    expect(className).toContain("duration-150");
    expect(className).toContain("starting:opacity-0");
    expect(className).toContain("motion-safe:starting:scale-[0.96]");
    expect(className).not.toMatch(/(^|\s)(scale|translate)-/);
  });

  it("keeps the bubble inside the viewport", () => {
    Object.defineProperty(window, "innerWidth", { value: 320, configurable: true });
    const rect = (left: number, width: number, top: number, height: number): DOMRect =>
      ({ left, width, top, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;
    const spy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      return this.getAttribute("role") === "tooltip" ? rect(0, 300, 0, 40) : rect(300, 16, 20, 16);
    });
    renderTooltip();
    fireEvent.click(screen.getByRole("button", { name: "What is this" }));
    const style = screen.getByRole("tooltip").style;
    expect(parseFloat(style.left)).toBeGreaterThanOrEqual(8);
    expect(parseFloat(style.left) + 300).toBeLessThanOrEqual(320 - 8);
    spy.mockRestore();
  });
});
